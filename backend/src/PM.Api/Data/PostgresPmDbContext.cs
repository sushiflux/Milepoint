using Microsoft.EntityFrameworkCore;

namespace PM.Api.Data;

public class PostgresPmDbContext : PmDbContextBase
{
    public PostgresPmDbContext(DbContextOptions<PostgresPmDbContext> options) : base(options)
    {
    }
}
