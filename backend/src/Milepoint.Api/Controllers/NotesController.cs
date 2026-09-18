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

        if (!IsValidColor(request.Color))
        {
            return BadRequest("Farbe muss ein gültiger Hex-Code sein (z.B. #3b82f6).");
        }

        var note = new Note
        {
            ProjectId = projectId,
            Title = request.Title,
            Content = request.Content,
            Color = request.Color,
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

        if (!IsValidColor(request.Color))
        {
            return BadRequest("Farbe muss ein gültiger Hex-Code sein (z.B. #3b82f6).");
        }

        note.Title = request.Title;
        note.Content = request.Content;
        // Color is always applied as given; null clears back to "use the default".
        note.Color = request.Color;
        note.UpdatedAt = DateTimeOffset.UtcNow;

        await SyncOutgoingLinksAsync(projectId, note);
        await _db.SaveChangesAsync();

        var dto = await LoadDtoAsync(projectId, noteId);
        return dto is null ? NotFound() : Ok(dto);
    }

    // Lightweight, high-frequency position sync for the free (physics-simulated) graph view -
    // deliberately separate from the full Update endpoint above (see UpdateNotePositionRequest's
    // doc comment). A single targeted EF Core update on exactly two columns via ExecuteUpdateAsync,
    // so no tracked entity is loaded/round-tripped just to change a position. No title-uniqueness
    // check, no content touch, no outgoing-link re-sync - none of that applies to a pure position
    // write. Rate-limiting/debouncing how often the frontend calls this is out of scope here
    // (handled client-side).
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
            .FirstOrDefaultAsync();

        return note is null ? null : ToDto(note);
    }

    // Accepts "#rgb" or "#rrggbb" (case-insensitive), the standard short/long CSS hex-color forms
    // - matches what an <input type="color"> or a frontend palette picker would ever actually
    // send. Null/empty is valid (means "no color chosen"); anything else must fully match.
    private static readonly Regex HexColorPattern = new("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", RegexOptions.Compiled);

    private static bool IsValidColor(string? color) => color is null || HexColorPattern.IsMatch(color);

    private static NoteDto ToDto(Note note) => new(
        note.Id,
        note.Title,
        note.Content,
        note.OutgoingLinks.Select(l => new NoteLinkRefDto(l.TargetNoteId, l.TargetNote.Title)).ToList(),
        note.IncomingLinks.Select(l => new NoteLinkRefDto(l.SourceNoteId, l.SourceNote.Title)).ToList(),
        note.Color,
        note.FreeViewX,
        note.FreeViewY,
        note.CreatedAt,
        note.UpdatedAt);
}
