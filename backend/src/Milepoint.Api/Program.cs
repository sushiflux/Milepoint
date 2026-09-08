using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Milepoint.Api.Auth;
using Milepoint.Api.Data;
using Milepoint.Api.Hubs;
using Milepoint.Api.Services;
using Milepoint.Api.Services.Transcription;

var builder = WebApplication.CreateBuilder(args);

var dbProvider = (builder.Configuration["DB_PROVIDER"] ?? "postgres").ToLowerInvariant();
var jwtSigningKey = builder.Configuration["JWT_SIGNING_KEY"]
    ?? throw new InvalidOperationException("JWT_SIGNING_KEY ist nicht gesetzt.");
var jwtIssuer = builder.Configuration["JWT_ISSUER"] ?? "milepoint-api";
var jwtAudience = builder.Configuration["JWT_AUDIENCE"] ?? "milepoint-client";

builder.Services.Configure<JwtOptions>(options =>
{
    options.SigningKey = jwtSigningKey;
    options.Issuer = jwtIssuer;
    options.Audience = jwtAudience;
    options.ExpiryMinutes = int.TryParse(builder.Configuration["JWT_EXPIRY_MINUTES"], out var minutes) ? minutes : 60;
});

var healthChecks = builder.Services.AddHealthChecks();

if (dbProvider == "mssql")
{
    var mssqlConnection = builder.Configuration.GetConnectionString("Mssql")
        ?? throw new InvalidOperationException("ConnectionStrings:Mssql fehlt.");

    builder.Services.AddDbContext<SqlServerPmDbContext>(options => options.UseSqlServer(mssqlConnection));
    builder.Services.AddScoped<PmDbContextBase>(sp => sp.GetRequiredService<SqlServerPmDbContext>());
    healthChecks.AddSqlServer(mssqlConnection, name: "mssql");
}
else
{
    var postgresConnection = builder.Configuration.GetConnectionString("Postgres")
        ?? throw new InvalidOperationException("ConnectionStrings:Postgres fehlt.");

    builder.Services.AddDbContext<PostgresPmDbContext>(options => options.UseNpgsql(postgresConnection));
    builder.Services.AddScoped<PmDbContextBase>(sp => sp.GetRequiredService<PostgresPmDbContext>());
    healthChecks.AddNpgSql(postgresConnection, name: "postgres");
}

var redisConnection = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrWhiteSpace(redisConnection))
{
    healthChecks.AddRedis(redisConnection, name: "redis");
}

// Persist Data Protection's key ring to the database (PmDbContextBase.DataProtectionKeys) instead
// of the default ephemeral/local-disk behavior. Without this, keys are lost on every container
// restart/recreate ("No XML encryptor configured" warning is the symptom for Identity's own use of
// Data Protection today) - and TranscriptionSettingsService's encrypted OpenAI/Google API keys
// would become permanently undecryptable the moment the backend container restarts. Works
// identically for both providers since PmDbContextBase (not the provider-specific subclass) is the
// registered IDataProtectionKeyContext, and PersistKeysToDbContext resolves it through DI per use
// via its own scope rather than needing a singleton instance here.
builder.Services.AddDataProtection()
    .SetApplicationName("Milepoint")
    .PersistKeysToDbContext<PmDbContextBase>();

// Singleton: IDataProtectionProvider is itself a singleton service with an internally cached key
// ring, and CreateProtector (called once in the constructor) is safe to reuse across the app's
// lifetime - no per-request state here, so there's no reason to pay for a scoped/transient
// resolution on every request that touches transcription settings.
builder.Services.AddSingleton<TranscriptionSettingsService>();

// Named/typed HttpClients for the three server-side transcription providers (Browser needs none -
// it never reaches the backend, see TranscriptionController). Whisper's target host is admin-
// configured per TranscriptionSettings.WhisperEndpointUrl and can change at runtime, so it gets a
// bare named client with no fixed BaseAddress (the service builds the full URL itself); OpenAI/
// Google always talk to the same fixed API host regardless of admin config, so those get a
// BaseAddress each. A shared, generous-but-bounded Timeout across all three accounts for
// transcription (and, for OpenAI/Google, an optional second summarization call) potentially taking
// longer than ASP.NET Core's HttpClient default of 100s would still allow, while still failing
// fast enough that a hung provider doesn't tie up a request indefinitely.
var transcriptionHttpTimeout = TimeSpan.FromSeconds(90);
builder.Services.AddHttpClient(WhisperTranscriptionService.HttpClientName, client =>
{
    client.Timeout = transcriptionHttpTimeout;
});
builder.Services.AddHttpClient(OpenAiTranscriptionService.HttpClientName, client =>
{
    client.BaseAddress = new Uri("https://api.openai.com/");
    client.Timeout = transcriptionHttpTimeout;
});
builder.Services.AddHttpClient(GoogleTranscriptionService.HttpClientName, client =>
{
    client.BaseAddress = new Uri("https://generativelanguage.googleapis.com/");
    client.Timeout = transcriptionHttpTimeout;
});

builder.Services.AddScoped<WhisperTranscriptionService>();
builder.Services.AddScoped<OpenAiTranscriptionService>();
builder.Services.AddScoped<GoogleTranscriptionService>();

builder.Services
    .AddIdentityCore<ApplicationUser>(options =>
    {
        // Relaxed for local dev convenience (admin/admin default login) - tighten before any public/prod use.
        options.Password.RequiredLength = 5;
        options.Password.RequireDigit = false;
        options.Password.RequireUppercase = false;
        options.Password.RequireNonAlphanumeric = false;
        options.User.RequireUniqueEmail = true;
    })
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<PmDbContextBase>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSigningKey))
        };

        // SignalR websockets can't send an Authorization header, so accept the token via query string for /hubs/*.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddScoped<TokenService>();

var allowedOrigins = (builder.Configuration["CORS_ALLOWED_ORIGINS"] ?? "http://localhost")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy("PmClient", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// SignalR has its own JSON serializer config, entirely separate from AddControllers' below - without
// this, hub payloads (workItemCreated/Updated/Moved) serialize enums as their raw int (Type=0,
// Priority=1) while REST responses correctly show "Task"/"Medium". Whichever one a WorkItem's data
// happened to arrive through first would win in the frontend's dedupe-by-id state update.
builder.Services.AddSignalR()
    .AddJsonProtocol(options =>
        options.PayloadSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PmDbContextBase>();
    await db.Database.MigrateAsync();

    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    foreach (var roleName in new[] { "Admin", "Projektleiter", "User" })
    {
        if (!await roleManager.RoleExistsAsync(roleName))
        {
            await roleManager.CreateAsync(new IdentityRole(roleName));
        }
    }

    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
    var adminUsername = builder.Configuration["ADMIN_USERNAME"];
    var adminPassword = builder.Configuration["ADMIN_INITIAL_PASSWORD"];
    if (!string.IsNullOrWhiteSpace(adminUsername) && !string.IsNullOrWhiteSpace(adminPassword))
    {
        var admin = await userManager.FindByNameAsync(adminUsername);
        if (admin is null)
        {
            admin = new ApplicationUser
            {
                UserName = adminUsername,
                Email = builder.Configuration["ADMIN_EMAIL"] ?? $"{adminUsername}@milepoint.local",
                DisplayName = "Admin",
                EmailConfirmed = true
            };

            var seedResult = await userManager.CreateAsync(admin, adminPassword);
            if (!seedResult.Succeeded)
            {
                var errors = string.Join("; ", seedResult.Errors.Select(e => e.Description));
                app.Logger.LogWarning("Admin-Seed-User konnte nicht angelegt werden: {Errors}", errors);
                admin = null;
            }
        }

        if (admin is not null)
        {
            // Seeded dev account gets both roles - full system config access and full project
            // visibility - since there's no SystemAdmin tier above it anymore.
            foreach (var role in new[] { "Admin", "Projektleiter" })
            {
                if (!await userManager.IsInRoleAsync(admin, role))
                {
                    await userManager.AddToRoleAsync(admin, role);
                }
            }
        }
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("PmClient");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<KanbanHub>("/hubs/kanban");
app.MapHealthChecks("/healthz");
// Read fresh on every request (not baked into IConfiguration at startup) so the version
// updates immediately when scripts/git-hooks/post-commit rewrites this file after a commit,
// without requiring a container restart.
// Dev and prod use the exact same vYear.Month.CommitOfTheYear scheme (e.g. v2026.8.64), no
// separate "-dev" marker - the fallback below only matters before the first
// start.ps1/post-commit run has ever written the file, and still follows the same format
// rather than a literal "dev" string.
var versionFilePath = Path.Combine(builder.Environment.ContentRootPath, "version.txt");
app.MapGet("/api/version", () =>
{
    var version = File.Exists(versionFilePath) ? File.ReadAllText(versionFilePath).Trim() : "v0.0.0";
    return Results.Ok(new { version });
});

app.Run();
