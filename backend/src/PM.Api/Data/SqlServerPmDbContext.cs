using Microsoft.EntityFrameworkCore;

namespace PM.Api.Data;

public class SqlServerPmDbContext : PmDbContextBase
{
    public SqlServerPmDbContext(DbContextOptions<SqlServerPmDbContext> options) : base(options)
    {
    }
}
