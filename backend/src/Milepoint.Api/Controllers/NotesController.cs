using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Notes;
using Milepoint.Api.Models;
using Milepoint.Api.Services;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId}/notes")]
public class NotesController : ControllerBase
{
    private readonly PmDbContextBase _db;

    public NotesController(PmDbContextBase db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<NoteDto>>> GetAll(string projectId)
    {
        var notes = await _db.Notes
            .Where(n => n.ProjectId == projectId)
            .Include(n => n.OutgoingLinks).ThenInclude(l => l.TargetNote)
            .Include(n => n.IncomingLinks).ThenInclude(l => l.SourceNote)
            .Include(n => n.ChildNotes)
            .Include(n => n.OutgoingEdgeOverrides)
            .OrderBy(n => n.Title)
            .ToListAsync();

        return Ok(notes.Select(ToDto));
    }

    [HttpGet("{noteId}")]
    public async Task<ActionResult<NoteDto>> GetOne(string projectId, string noteId)
    {
        var dto = await LoadDtoAsync(projectId, noteId);
        return dto is null ? NotFound() : Ok(dto);
    }

    [HttpPost]
    public async Task<ActionResult<NoteDto>> Create(string projectId, CreateNoteRequest request)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId);
        if (!projectExists)
        {
            return NotFound();
        }

        var titleTaken = await _db.Notes.AnyAsync(n => n.ProjectId == projectId && n.Title == request.Title);
        if (titleTaken)
        {
            return Conflict("Eine Notiz mit diesem Titel existiert bereits in diesem Projekt.");
        }

        if (request.ParentNoteId is not null &&
            !await _db.Notes.AnyAsync(n => n.Id == request.ParentNoteId && n.ProjectId == projectId))
        {
            return BadRequest("Übergeordnete Notiz gehört nicht zu diesem Projekt.");
        }

        if (!IsValidColor(request.Color))
        {
            return BadRequest("Farbe muss ein gültiger Hex-Code sein (z.B. #3b82f6).");
        }

        if (!IsValidColor(request.EdgeColor))
        {
            return BadRequest("Linienfarbe muss ein gültiger Hex-Code sein (z.B. #3b82f6).");
        }

        if (!IsValidEdgeWidth(request.EdgeWidth))
        {
            return BadRequest($"Linienstärke muss zwischen {MinEdgeWidth} und {MaxEdgeWidth} px liegen.");
        }

        var note = new Note
        {
            ProjectId = projectId,
            Title = request.Title,
            Content = request.Content,
            ParentNoteId = request.ParentNoteId,
            Color = request.Color,
            Shape = request.Shape,
            EdgeStyle = request.EdgeStyle,
            EdgeArrow = request.EdgeArrow,
            EdgeWidth = request.EdgeWidth,
            EdgeColor = request.EdgeColor
        };

        _db.Notes.Add(note);
        await _db.SaveChangesAsync();

        await SyncOutgoingLinksAsync(projectId, note);
        await _db.SaveChangesAsync();

        var dto = await LoadDtoAsync(projectId, note.Id);
        return CreatedAtAction(nameof(GetOne), new { projectId, noteId = note.Id }, dto);
    }

    [HttpPut("{noteId}")]
    public async Task<ActionResult<NoteDto>> Update(string projectId, string noteId, UpdateNoteRequest request)
    {
        var note = await _db.Notes.FirstOrDefaultAsync(n => n.Id == noteId && n.ProjectId == projectId);
        if (note is null)
        {
            return NotFound();
        }

        var titleTaken = await _db.Notes.AnyAsync(n => n.ProjectId == projectId && n.Id != noteId && n.Title == request.Title);
        if (titleTaken)
        {
            return Conflict("Eine Notiz mit diesem Titel existiert bereits in diesem Projekt.");
        }

        if (request.SetParentNoteId && request.ParentNoteId is not null)
        {
            if (request.ParentNoteId == noteId)
            {
                return BadRequest("Eine Notiz kann nicht ihre eigene übergeordnete Notiz sein.");
            }

            if (!await _db.Notes.AnyAsync(n => n.Id == request.ParentNoteId && n.ProjectId == projectId))
            {
                return BadRequest("Übergeordnete Notiz gehört nicht zu diesem Projekt.");
            }

            if (await WouldCreateCycleAsync(noteId, request.ParentNoteId))
            {
                return BadRequest("Diese Zuordnung würde einen Zyklus in der Notiz-Hierarchie erzeugen.");
            }
        }

        if (!IsValidColor(request.Color))
        {
            return BadRequest("Farbe muss ein gültiger Hex-Code sein (z.B. #3b82f6).");
        }

        if (!IsValidColor(request.EdgeColor))
        {
            return BadRequest("Linienfarbe muss ein gültiger Hex-Code sein (z.B. #3b82f6).");
        }

        if (!IsValidEdgeWidth(request.EdgeWidth))
        {
            return BadRequest($"Linienstärke muss zwischen {MinEdgeWidth} und {MaxEdgeWidth} px liegen.");
        }

        note.Title = request.Title;
        note.Content = request.Content;
        // Only touch the hierarchy when the caller explicitly asked to (see SetParentNoteId's doc
        // comment on UpdateNoteRequest) - a plain title/content save must never silently detach a
        // note from its parent just because the request happened to omit ParentNoteId.
        if (request.SetParentNoteId)
        {
            note.ParentNoteId = request.ParentNoteId;
        }
        // Color/Shape/EdgeStyle/EdgeArrow/EdgeWidth/EdgeColor are always applied as given (no
        // tri-state flag needed - see UpdateNoteRequest's doc comment); null clears back to "use
        // the default".
        note.Color = request.Color;
        note.Shape = request.Shape;
        note.EdgeStyle = request.EdgeStyle;
        note.EdgeArrow = request.EdgeArrow;
        note.EdgeWidth = request.EdgeWidth;
        note.EdgeColor = request.EdgeColor;
        note.UpdatedAt = DateTimeOffset.UtcNow;

        await SyncOutgoingLinksAsync(projectId, note);
        await _db.SaveChangesAsync();

        var dto = await LoadDtoAsync(projectId, noteId);
        return dto is null ? NotFound() : Ok(dto);
    }

    // Lightweight, high-frequency position sync for the free (physics-simulated) graph view -
    // deliberately separate from the full Update endpoint above (see UpdateNotePositionRequest's
    // doc comment). A single targeted EF Core update on exactly two columns via ExecuteUpdateAsync
    // (same pattern already used for the ParentNoteId bulk re-parent in Delete below), so no
    // tracked entity is loaded/round-tripped just to change a position. No title-uniqueness check,
    // no content/hierarchy touch, no outgoing-link re-sync - none of that applies to a pure
    // position write. Rate-limiting/debouncing how often the frontend calls this is out of scope
    // here (handled client-side).
    [HttpPut("{noteId}/position")]
    public async Task<IActionResult> UpdatePosition(string projectId, string noteId, UpdateNotePositionRequest request)
    {
        var updated = await _db.Notes
            .Where(n => n.Id == noteId && n.ProjectId == projectId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(n => n.FreeViewX, request.X)
                .SetProperty(n => n.FreeViewY, request.Y)
                .SetProperty(n => n.UpdatedAt, DateTimeOffset.UtcNow));

        return updated == 0 ? NotFound() : NoContent();
    }

    [HttpDelete("{noteId}")]
    public async Task<IActionResult> Delete(string projectId, string noteId)
    {
        var note = await _db.Notes.FirstOrDefaultAsync(n => n.Id == noteId && n.ProjectId == projectId);
        if (note is null)
        {
            return NotFound();
        }

        var links = await _db.NoteLinks
            .Where(l => l.SourceNoteId == noteId || l.TargetNoteId == noteId)
            .ToListAsync();
        _db.NoteLinks.RemoveRange(links);

        // NoteEdgeOverride rows are NoAction on both the source and target FK (see
        // PmDbContextBase's comment) - unlike NoteLink they're not always removed via the
        // Project's own cascade path either, since a project delete's cascade already covers this
        // table directly, but a single note's delete here still needs to clear both directions
        // explicitly or the FK constraint rejects the delete.
        await _db.NoteEdgeOverrides
            .Where(o => o.SourceNoteId == noteId || o.TargetNoteId == noteId)
            .ExecuteDeleteAsync();

        // Deletion decision: children are promoted to root-level notes (ParentNoteId = null)
        // rather than deleted along with their parent. Unlike WorkItem's subtree-delete (a Kanban
        // task's subtasks are meaningless without it), a note's children are independent content a
        // user wrote deliberately - silently deleting a whole branch of someone's notes because
        // they removed the top one would be surprising and is not reversible. Matches Restrict on
        // the FK above: this explicit re-parent has to happen before the parent row can go away.
        await _db.Notes
            .Where(n => n.ParentNoteId == noteId)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ParentNoteId, (string?)null));

        _db.Notes.Remove(note);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    // Re-derives this note's outgoing [[Title]] links from its current content. Other notes'
    // stored links to this one are left untouched, so renaming a note does not retroactively
    // break backlinks already recorded against its (stable) Id.
    private async Task SyncOutgoingLinksAsync(string projectId, Note note)
    {
        var existing = await _db.NoteLinks.Where(l => l.SourceNoteId == note.Id).ToListAsync();
        _db.NoteLinks.RemoveRange(existing);

        var titles = NoteLinkParser.ExtractLinkTitles(note.Content);
        if (titles.Count == 0)
        {
            return;
        }

        var targets = await _db.Notes
            .Where(n => n.ProjectId == projectId && n.Id != note.Id && titles.Contains(n.Title))
            .ToListAsync();

        foreach (var target in targets)
        {
            _db.NoteLinks.Add(new NoteLink { SourceNoteId = note.Id, TargetNoteId = target.Id });
        }
    }

    private async Task<NoteDto?> LoadDtoAsync(string projectId, string noteId)
    {
        var note = await _db.Notes
            .Where(n => n.ProjectId == projectId && n.Id == noteId)
            .Include(n => n.OutgoingLinks).ThenInclude(l => l.TargetNote)
            .Include(n => n.IncomingLinks).ThenInclude(l => l.SourceNote)
            .Include(n => n.ChildNotes)
            .Include(n => n.OutgoingEdgeOverrides)
            .FirstOrDefaultAsync();

        return note is null ? null : ToDto(note);
    }

    // Walks the ancestor chain starting at targetParentId (the note about to become candidateNoteId's
    // parent) all the way up to the root, checking whether candidateNoteId itself shows up along the
    // way. If it does, setting the parent would close a loop (directly, e.g. A -> A, or transitively,
    // e.g. A -> B -> C -> A) - the whole point of a tree is that every node has a finite path to a
    // root, so any parent assignment that reintroduces a node into its own ancestor chain is rejected.
    // Bounded by MaxDepthGuard rather than trusting the data to be acyclic already, so a
    // pre-existing bug/manual DB edit can't turn this into an infinite loop.
    private async Task<bool> WouldCreateCycleAsync(string candidateNoteId, string targetParentId)
    {
        const int maxDepthGuard = 10_000;
        var currentId = targetParentId;

        for (var depth = 0; depth < maxDepthGuard; depth++)
        {
            if (currentId == candidateNoteId)
            {
                return true;
            }

            var parentId = await _db.Notes
                .Where(n => n.Id == currentId)
                .Select(n => n.ParentNoteId)
                .FirstOrDefaultAsync();

            if (parentId is null)
            {
                return false;
            }

            currentId = parentId;
        }

        // Ancestor chain longer than the guard allows - treat as a (pre-existing) cycle rather
        // than risk an unbounded loop.
        return true;
    }

    // Accepts "#rgb" or "#rrggbb" (case-insensitive), the standard short/long CSS hex-color forms
    // - matches what an <input type="color"> or a frontend palette picker would ever actually
    // send. Null/empty is valid (means "no color chosen"); anything else must fully match.
    private static readonly Regex HexColorPattern = new("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", RegexOptions.Compiled);

    private static bool IsValidColor(string? color) => color is null || HexColorPattern.IsMatch(color);

    // Sensible clamp on the user-facing "how thick" slider - not a hard technical limit, just
    // guards against a garbage/out-of-range value reaching the database (e.g. a manually crafted
    // request). 0.5 keeps a line visible at all (0 or negative would vanish/error in SVG); 12
    // comfortably covers "very thick, still clearly a line" without needing an unbounded range the
    // UI slider would have to accommodate.
    private const double MinEdgeWidth = 0.5;
    private const double MaxEdgeWidth = 12;

    private static bool IsValidEdgeWidth(double? width) => width is null || (width >= MinEdgeWidth && width <= MaxEdgeWidth);

    private static NoteDto ToDto(Note note) => new(
        note.Id,
        note.Title,
        note.Content,
        note.ParentNoteId,
        note.ChildNotes.Select(c => c.Id).ToList(),
        note.OutgoingLinks.Select(l => new NoteLinkRefDto(l.TargetNoteId, l.TargetNote.Title)).ToList(),
        note.IncomingLinks.Select(l => new NoteLinkRefDto(l.SourceNoteId, l.SourceNote.Title)).ToList(),
        note.Color,
        note.Shape,
        note.EdgeStyle,
        note.EdgeArrow,
        note.EdgeWidth,
        note.EdgeColor,
        note.OutgoingEdgeOverrides.Select(o => new NoteEdgeOverrideDto(o.TargetNoteId, o.Width, o.Color)).ToList(),
        note.FreeViewX,
        note.FreeViewY,
        note.CreatedAt,
        note.UpdatedAt);

    // Creates or replaces the style override for one specific connection FROM this note (see
    // NoteEdgeOverride's doc comment) - both a tree edge to a ChildNote and a free-view
    // OutgoingLink use the same shape, so this one endpoint covers both without needing to know
    // which kind of connection it is. A request with both Width and Color null deletes the row
    // instead of storing a no-op override, so "reset to the note's own EdgeWidth/EdgeColor" is a
    // single call either way rather than a separate delete-vs-upsert decision the frontend has to
    // make itself.
    [HttpPut("{noteId}/edge-overrides/{targetNoteId}")]
    public async Task<IActionResult> UpsertEdgeOverride(string projectId, string noteId, string targetNoteId, UpdateNoteEdgeOverrideRequest request)
    {
        var sourceExists = await _db.Notes.AnyAsync(n => n.Id == noteId && n.ProjectId == projectId);
        if (!sourceExists)
        {
            return NotFound();
        }

        var targetExists = await _db.Notes.AnyAsync(n => n.Id == targetNoteId && n.ProjectId == projectId);
        if (!targetExists)
        {
            return BadRequest("Ziel-Notiz gehört nicht zu diesem Projekt.");
        }

        if (!IsValidColor(request.Color))
        {
            return BadRequest("Linienfarbe muss ein gültiger Hex-Code sein (z.B. #3b82f6).");
        }

        if (!IsValidEdgeWidth(request.Width))
        {
            return BadRequest($"Linienstärke muss zwischen {MinEdgeWidth} und {MaxEdgeWidth} px liegen.");
        }

        if (request.Width is null && request.Color is null)
        {
            await _db.NoteEdgeOverrides
                .Where(o => o.SourceNoteId == noteId && o.TargetNoteId == targetNoteId && o.ProjectId == projectId)
                .ExecuteDeleteAsync();
            return NoContent();
        }

        var existing = await _db.NoteEdgeOverrides
            .FirstOrDefaultAsync(o => o.SourceNoteId == noteId && o.TargetNoteId == targetNoteId && o.ProjectId == projectId);

        if (existing is null)
        {
            _db.NoteEdgeOverrides.Add(new NoteEdgeOverride
            {
                ProjectId = projectId,
                SourceNoteId = noteId,
                TargetNoteId = targetNoteId,
                Width = request.Width,
                Color = request.Color
            });
        }
        else
        {
            existing.Width = request.Width;
            existing.Color = request.Color;
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }
}
