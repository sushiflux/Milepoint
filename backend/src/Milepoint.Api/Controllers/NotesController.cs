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

        var note = new Note
        {
            ProjectId = projectId,
            Title = request.Title,
            Content = request.Content,
            ParentNoteId = request.ParentNoteId
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

        note.Title = request.Title;
        note.Content = request.Content;
        // Only touch the hierarchy when the caller explicitly asked to (see SetParentNoteId's doc
        // comment on UpdateNoteRequest) - a plain title/content save must never silently detach a
        // note from its parent just because the request happened to omit ParentNoteId.
        if (request.SetParentNoteId)
        {
            note.ParentNoteId = request.ParentNoteId;
        }
        note.UpdatedAt = DateTimeOffset.UtcNow;

        await SyncOutgoingLinksAsync(projectId, note);
        await _db.SaveChangesAsync();

        var dto = await LoadDtoAsync(projectId, noteId);
        return dto is null ? NotFound() : Ok(dto);
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

    private static NoteDto ToDto(Note note) => new(
        note.Id,
        note.Title,
        note.Content,
        note.ParentNoteId,
        note.ChildNotes.Select(c => c.Id).ToList(),
        note.OutgoingLinks.Select(l => new NoteLinkRefDto(l.TargetNoteId, l.TargetNote.Title)).ToList(),
        note.IncomingLinks.Select(l => new NoteLinkRefDto(l.SourceNoteId, l.SourceNote.Title)).ToList(),
        note.CreatedAt,
        note.UpdatedAt);
}
