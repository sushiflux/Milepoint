using Microsoft.EntityFrameworkCore;

namespace Milepoint.Api.Data;

public class PostgresPmDbContext : PmDbContextBase
{
    public PostgresPmDbContext(DbContextOptions<PostgresPmDbContext> options) : base(options)
    {
    }
}
