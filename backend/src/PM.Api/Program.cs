using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PM.Api.Auth;
using PM.Api.Data;
using PM.Api.Hubs;

var builder = WebApplication.CreateBuilder(args);

var dbProvider = (builder.Configuration["DB_PROVIDER"] ?? "postgres").ToLowerInvariant();
var jwtSigningKey = builder.Configuration["JWT_SIGNING_KEY"]
    ?? throw new InvalidOperationException("JWT_SIGNING_KEY ist nicht gesetzt.");
var jwtIssuer = builder.Configuration["JWT_ISSUER"] ?? "pm-api";
var jwtAudience = builder.Configuration["JWT_AUDIENCE"] ?? "pm-client";

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
        options.Password.RequiredLength = 8;
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

app.Run();
