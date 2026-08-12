using Microsoft.EntityFrameworkCore;

namespace Milepoint.Api.Data;

public class SqlServerPmDbContext : PmDbContextBase
{
    public SqlServerPmDbContext(DbContextOptions<SqlServerPmDbContext> options) : base(options)
    {
    }
}
