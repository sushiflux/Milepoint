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
    public DbSet<SequenceCounter> SequenceCounters => Set<SequenceCounter>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<Milestone> Milestones => Set<Milestone>();
    public DbSet<WorkItemDependency> WorkItemDependencies => Set<WorkItemDependency>();
    public DbSet<MilestoneDependency> MilestoneDependencies => Set<MilestoneDependency>();
    public DbSet<Note> Notes => Set<Note>();
    public DbSet<NoteLink> NoteLinks => Set<NoteLink>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Project>(entity =>
        {
            entity.Property(p => p.Id).HasMaxLength(40);
            entity.Property(p => p.Name).HasMaxLength(200).IsRequired();

            entity.HasMany(p => p.Boards)
                .WithOne(b => b.Project)
                .HasForeignKey(b => b.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(p => p.Labels)
                .WithOne(l => l.Project)
                .HasForeignKey(l => l.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(p => p.CreatedByUser)
                .WithMany()
                .HasForeignKey(p => p.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<SequenceCounter>(entity =>
        {
            entity.HasKey(c => c.Key);
            entity.Property(c => c.Key).HasMaxLength(20);
        });

        builder.Entity<ProjectMember>(entity =>
        {
            entity.HasKey(m => new { m.ProjectId, m.UserId });
            entity.Property(m => m.ProjectId).HasMaxLength(40);

            entity.HasOne(m => m.Project)
                .WithMany(p => p.Members)
                .HasForeignKey(m => m.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(m => m.User)
                .WithMany()
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Board>(entity =>
        {
            entity.Property(b => b.Id).HasMaxLength(40);
            entity.Property(b => b.ProjectId).HasMaxLength(40);
            entity.Property(b => b.Name).HasMaxLength(200).IsRequired();

            entity.HasMany(b => b.Columns)
                .WithOne(c => c.Board)
                .HasForeignKey(c => c.BoardId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<BoardColumn>(entity =>
        {
            entity.Property(c => c.BoardId).HasMaxLength(40);
            entity.Property(c => c.Name).HasMaxLength(100).IsRequired();

            entity.HasMany(c => c.WorkItems)
                .WithOne(w => w.Column)
                .HasForeignKey(w => w.ColumnId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<WorkItem>(entity =>
        {
            entity.Property(w => w.Id).HasMaxLength(40);
            entity.Property(w => w.ProjectId).HasMaxLength(40);
            entity.Property(w => w.BoardId).HasMaxLength(40);
            entity.Property(w => w.Title).HasMaxLength(300).IsRequired();
            entity.Property(w => w.ReferencePrefix).HasMaxLength(10).IsRequired();

            entity.HasOne(w => w.Assignee)
                .WithMany()
                .HasForeignKey(w => w.AssigneeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.Property(w => w.ParentWorkItemId).HasMaxLength(40);
            entity.HasOne(w => w.ParentWorkItem)
                .WithMany(w => w.Children)
                .HasForeignKey(w => w.ParentWorkItemId)
                .OnDelete(DeleteBehavior.Restrict);

            // NoAction on both sides: SQL Server rejects cascade paths that could reach WorkItems
            // twice (once via BoardColumn, once via this join table); Postgres allows it, but we
            // keep the model identical across providers.
            entity.HasMany(w => w.Labels)
                .WithMany(l => l.WorkItems)
                .UsingEntity<Dictionary<string, object>>(
                    "WorkItemLabel",
                    right => right.HasOne<Label>().WithMany().HasForeignKey("LabelsId").OnDelete(DeleteBehavior.NoAction),
                    left => left.HasOne<WorkItem>().WithMany().HasForeignKey("WorkItemsId").OnDelete(DeleteBehavior.NoAction),
                    join => join.Property<string>("WorkItemsId").HasMaxLength(40));
        });

        builder.Entity<Label>(entity =>
        {
            entity.Property(l => l.ProjectId).HasMaxLength(40);
            entity.Property(l => l.Name).HasMaxLength(80).IsRequired();
        });

        builder.Entity<Milestone>(entity =>
        {
            entity.Property(m => m.Id).HasMaxLength(40);
            entity.Property(m => m.ProjectId).HasMaxLength(40);
            entity.Property(m => m.Name).HasMaxLength(200).IsRequired();

            entity.HasOne(m => m.Project)
                .WithMany()
                .HasForeignKey(m => m.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            // NoAction, same reasoning as WorkItemDependency/MilestoneDependency above - WorkItem
            // already has a cascade path via Project -> Board -> BoardColumn. ProjectsController
            // clears this before deleting a project, same as it does for WorkItem.ParentWorkItemId.
            entity.Property(m => m.ParentWorkItemId).HasMaxLength(40);
            entity.HasOne(m => m.ParentWorkItem)
                .WithMany()
                .HasForeignKey(m => m.ParentWorkItemId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<WorkItemDependency>(entity =>
        {
            entity.HasKey(d => new { d.DependentWorkItemId, d.BlockingWorkItemId });
            entity.Property(d => d.DependentWorkItemId).HasMaxLength(40);
            entity.Property(d => d.BlockingWorkItemId).HasMaxLength(40);

            // NoAction on both sides, same reasoning as WorkItemLabel above - WorkItem already has
            // multiple cascade sources, adding a third (two, here) would hit the same SQL Server error.
            entity.HasOne(d => d.DependentWorkItem)
                .WithMany(w => w.Dependencies)
                .HasForeignKey(d => d.DependentWorkItemId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(d => d.BlockingWorkItem)
                .WithMany()
                .HasForeignKey(d => d.BlockingWorkItemId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<MilestoneDependency>(entity =>
        {
            entity.HasKey(d => new { d.MilestoneId, d.WorkItemId });
            entity.Property(d => d.MilestoneId).HasMaxLength(40);
            entity.Property(d => d.WorkItemId).HasMaxLength(40);

            // WorkItemId is NoAction, same reasoning as WorkItemDependency above (WorkItem already
            // has a cascade path via Project -> Board -> BoardColumn). MilestoneId can cascade since
            // it's the only path into this table - deleting a project's milestones this way also
            // clears their dependency rows before the WorkItem side of the cascade runs.
            entity.HasOne(d => d.Milestone)
                .WithMany(m => m.WorkItemLinks)
                .HasForeignKey(d => d.MilestoneId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(d => d.WorkItem)
                .WithMany(w => w.MilestoneLinks)
                .HasForeignKey(d => d.WorkItemId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<Note>(entity =>
        {
            entity.Property(n => n.Id).HasMaxLength(40);
            entity.Property(n => n.ProjectId).HasMaxLength(40);
            entity.Property(n => n.Title).HasMaxLength(200).IsRequired();

            entity.HasIndex(n => new { n.ProjectId, n.Title }).IsUnique();

            entity.HasOne(n => n.Project)
                .WithMany()
                .HasForeignKey(n => n.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<NoteLink>(entity =>
        {
            entity.HasKey(l => new { l.SourceNoteId, l.TargetNoteId });
            entity.Property(l => l.SourceNoteId).HasMaxLength(40);
            entity.Property(l => l.TargetNoteId).HasMaxLength(40);

            // NoAction on both sides, same reasoning as WorkItemLabel/WorkItemDependency above.
            entity.HasOne(l => l.SourceNote)
                .WithMany(n => n.OutgoingLinks)
                .HasForeignKey(l => l.SourceNoteId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(l => l.TargetNote)
                .WithMany(n => n.IncomingLinks)
                .HasForeignKey(l => l.TargetNoteId)
                .OnDelete(DeleteBehavior.NoAction);
        });
    }
}
