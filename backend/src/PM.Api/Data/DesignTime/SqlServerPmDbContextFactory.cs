using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace PM.Api.Data.DesignTime;

// Only used by "dotnet ef migrations add/remove" at design time. The runtime app
// wires up the real connection string via Program.cs and docker-compose env vars.
public class SqlServerPmDbContextFactory : IDesignTimeDbContextFactory<SqlServerPmDbContext>
{
    public SqlServerPmDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("PM_DESIGNTIME_MSSQL_CONNECTION")
            ?? "Server=localhost,1433;Database=PM;User Id=sa;Password=Placeholder!123;TrustServerCertificate=True";

        var builder = new DbContextOptionsBuilder<SqlServerPmDbContext>();
        builder.UseSqlServer(connectionString);

        return new SqlServerPmDbContext(builder.Options);
    }
}
