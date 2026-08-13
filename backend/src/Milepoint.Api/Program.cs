using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Milepoint.Api.Auth;
using Milepoint.Api.Data;
using Milepoint.Api.Hubs;

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

builder.Services.AddSignalR();
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
app.MapGet("/api/version", () => Results.Ok(new { version = builder.Configuration["APP_VERSION"] ?? "dev" }));

app.Run();
