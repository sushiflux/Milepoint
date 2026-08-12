using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Models;

namespace Milepoint.Api.Data;

public abstract class PmDbContextBase : IdentityDbContext<ApplicationUser>
{
    protected PmDbContextBase(DbContextOptions options) : base(options)
    {
    }

    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Board> Boards => Set<Board>();
    public DbSet<BoardColumn> BoardColumns => Set<BoardColumn>();
    public DbSet<WorkItem> WorkItems => Set<WorkItem>();
    public DbSet<Label> Labels => Set<Label>();
    public DbSet<ProjectCategory> ProjectCategories => Set<ProjectCategory>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Project>(entity =>
        {
            entity.HasIndex(p => p.Key).IsUnique();
            entity.Property(p => p.Key).HasMaxLength(20).IsRequired();
            entity.Property(p => p.Name).HasMaxLength(200).IsRequired();

            entity.HasMany(p => p.Boards)
                .WithOne(b => b.Project)
                .HasForeignKey(b => b.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(p => p.Labels)
                .WithOne(l => l.Project)
                .HasForeignKey(l => l.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(p => p.ProjectCategory)
                .WithMany(c => c.Projects)
                .HasForeignKey(p => p.ProjectCategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ProjectCategory>(entity =>
        {
            entity.HasIndex(c => c.Code).IsUnique();
            entity.Property(c => c.Code).HasMaxLength(10).IsRequired();
            entity.Property(c => c.Name).HasMaxLength(100).IsRequired();
        });

        builder.Entity<Board>(entity =>
        {
            entity.Property(b => b.Name).HasMaxLength(200).IsRequired();

            entity.HasMany(b => b.Columns)
                .WithOne(c => c.Board)
                .HasForeignKey(c => c.BoardId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<BoardColumn>(entity =>
        {
            entity.Property(c => c.Name).HasMaxLength(100).IsRequired();

            entity.HasMany(c => c.WorkItems)
                .WithOne(w => w.Column)
                .HasForeignKey(w => w.ColumnId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<WorkItem>(entity =>
        {
            entity.Property(w => w.Title).HasMaxLength(300).IsRequired();

            entity.HasOne(w => w.Assignee)
                .WithMany()
                .HasForeignKey(w => w.AssigneeId)
                .OnDelete(DeleteBehavior.SetNull);

            // NoAction on both sides: SQL Server rejects cascade paths that could reach WorkItems
            // twice (once via BoardColumn, once via this join table); Postgres allows it, but we
            // keep the model identical across providers.
            entity.HasMany(w => w.Labels)
                .WithMany(l => l.WorkItems)
                .UsingEntity<Dictionary<string, object>>(
                    "WorkItemLabel",
                    right => right.HasOne<Label>().WithMany().HasForeignKey("LabelsId").OnDelete(DeleteBehavior.NoAction),
                    left => left.HasOne<WorkItem>().WithMany().HasForeignKey("WorkItemsId").OnDelete(DeleteBehavior.NoAction));
        });

        builder.Entity<Label>(entity =>
        {
            entity.Property(l => l.Name).HasMaxLength(80).IsRequired();
        });
    }
}
