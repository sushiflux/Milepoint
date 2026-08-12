using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace PM.Api.Data.DesignTime;

// Only used by "dotnet ef migrations add/remove" at design time. The runtime app
// wires up the real connection string via Program.cs and docker-compose env vars.
public class PostgresPmDbContextFactory : IDesignTimeDbContextFactory<PostgresPmDbContext>
{
    public PostgresPmDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("PM_DESIGNTIME_POSTGRES_CONNECTION")
            ?? "Host=localhost;Port=5432;Database=pm;Username=pm;Password=pm";

        var builder = new DbContextOptionsBuilder<PostgresPmDbContext>();
        builder.UseNpgsql(connectionString);

        return new PostgresPmDbContext(builder.Options);
    }
}
