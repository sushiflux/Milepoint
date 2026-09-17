using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Models;

namespace Milepoint.Api.Data;

// IDataProtectionKeyContext: Data Protection's key ring is persisted here (DataProtectionKeys
// table, below) rather than to disk. There's no dedicated writable volume for the backend
// container in this project's docker-compose.yml (only a dev-only source bind mount and a NuGet
// cache volume - neither is appropriate for a durable secret store, and neither exists at all in
// a non-bind-mounted/prod-style deployment of the image). The database is already the durable,
// backed-up store shared by both providers, so persisting keys there means API keys encrypted via
// TranscriptionSettingsService stay decryptable across container restarts/recreates without
// introducing a new volume, gitignore entry, or key-file path to manage. See Program.cs's
// AddDataProtection().PersistKeysToDbContext<PmDbContextBase>() call.
public abstract class PmDbContextBase : IdentityDbContext<ApplicationUser>, IDataProtectionKeyContext
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
    public DbSet<ProjectFavorite> ProjectFavorites => Set<ProjectFavorite>();
    public DbSet<UserPreference> UserPreferences => Set<UserPreference>();
    public DbSet<Milestone> Milestones => Set<Milestone>();
    public DbSet<WorkItemDependency> WorkItemDependencies => Set<WorkItemDependency>();
    public DbSet<MilestoneDependency> MilestoneDependencies => Set<MilestoneDependency>();
    public DbSet<Note> Notes => Set<Note>();
    public DbSet<NoteLink> NoteLinks => Set<NoteLink>();
    public DbSet<NoteEdgeOverride> NoteEdgeOverrides => Set<NoteEdgeOverride>();
    public DbSet<TranscriptionSettings> TranscriptionSettings => Set<TranscriptionSettings>();

    // IDataProtectionKeyContext requires a settable DbSet property (not just Set<T>()) named
    // exactly DataProtectionKeys - see class-level comment above for why keys live here.
    public DbSet<Microsoft.AspNetCore.DataProtection.EntityFrameworkCore.DataProtectionKey> DataProtectionKeys { get; set; } = null!;

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

        builder.Entity<ProjectFavorite>(entity =>
        {
            entity.HasKey(f => new { f.ProjectId, f.UserId });
            entity.Property(f => f.ProjectId).HasMaxLength(40);

            entity.HasOne(f => f.Project)
                .WithMany()
                .HasForeignKey(f => f.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(f => f.User)
                .WithMany()
                .HasForeignKey(f => f.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<UserPreference>(entity =>
        {
            entity.HasKey(p => new { p.UserId, p.Key });
            entity.Property(p => p.Key).HasMaxLength(100);
            entity.Property(p => p.Value).HasMaxLength(500).IsRequired();

            entity.HasOne(p => p.User)
                .WithMany()
                .HasForeignKey(p => p.UserId)
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

            // 9 chars covers the longest valid value (#RRGGBBAA); the actually-accepted formats
            // (#fff / #3b82f6, validated in NotesController) are shorter still.
            entity.Property(n => n.Color).HasMaxLength(9);
            entity.Property(n => n.EdgeColor).HasMaxLength(9);
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

        builder.Entity<NoteEdgeOverride>(entity =>
        {
            entity.HasKey(o => new { o.SourceNoteId, o.TargetNoteId });
            entity.Property(o => o.ProjectId).HasMaxLength(40);
            entity.Property(o => o.SourceNoteId).HasMaxLength(40);
            entity.Property(o => o.TargetNoteId).HasMaxLength(40);
            entity.Property(o => o.Color).HasMaxLength(9);

            entity.HasOne(o => o.Project)
                .WithMany()
                .HasForeignKey(o => o.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            // NoAction on both sides, same reasoning as NoteLink above (Note already has a cascade
            // path via Project, adding a second cascade source from here would risk the same SQL
            // Server multi-cascade-path rejection).
            entity.HasOne(o => o.SourceNote)
                .WithMany(n => n.OutgoingEdgeOverrides)
                .HasForeignKey(o => o.SourceNoteId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(o => o.TargetNote)
                .WithMany()
                .HasForeignKey(o => o.TargetNoteId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<TranscriptionSettings>(entity =>
        {
            // No IsRowVersion/concurrency token here on purpose: this is a rarely-written admin
            // config singleton, not a high-contention row - EF's default "last write wins" is
            // fine, matching every other entity in this DbContext (none use concurrency tokens).
            entity.Property(t => t.Id).ValueGeneratedNever();
            entity.Property(t => t.WhisperEndpointUrl).HasMaxLength(500);
            entity.Property(t => t.OpenAiApiKeyEncrypted).HasMaxLength(2000);
            entity.Property(t => t.GoogleApiKeyEncrypted).HasMaxLength(2000);
            entity.Property(t => t.Language).HasMaxLength(20).IsRequired();
            entity.Property(t => t.AutoSummarize).IsRequired();

            // Singleton enforced at the data layer: only TranscriptionSettings.SingletonId (1) is
            // ever valid. A CHECK constraint (rather than relying purely on application code) means
            // even a rogue direct insert/manual DB edit can't create a second row. The column name
            // is double-quoted ("Id") rather than bare - Postgres folds an unquoted identifier to
            // lowercase, but EF creates the actual column as mixed-case "Id", so a bare `Id = 1`
            // check fails at migration time with "column \"id\" does not exist" (confirmed live -
            // this comment previously claimed unquoted was fine on Postgres, which was wrong).
            // Double-quoted identifiers work identically as quoted identifiers on SqlServer (under
            // the default QUOTED_IDENTIFIER ON that EF Core migrations run with), so the same
            // constraint body still works unmodified in both provider-specific migrations.
            // Fully-qualified on purpose: this class also exposes a same-named DbSet<TranscriptionSettings>
            // property (line 37) - inside PmDbContextBase, an unqualified "TranscriptionSettings" resolves
            // to that instance property (a DbSet), not the Models.TranscriptionSettings type, since member
            // lookup within the class's own scope wins over an external type name.
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_TranscriptionSettings_SingletonId",
                $"\"Id\" = {Models.TranscriptionSettings.SingletonId}"));
        });
    }
}
