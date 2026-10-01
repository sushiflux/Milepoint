using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Boards;
using Milepoint.Api.Models;

namespace Milepoint.Api.Controllers;

// Managing the columns of a board. Only Projektleiter and Admin may do any of this (server-side
// rule, the UI mirrors it). The four built-in columns can only be hidden/shown; custom ones can be
// added, renamed, retyped, reordered and deleted. Invariants kept here: a column may only be hidden
// or deleted while empty, and at least one visible Todo and one visible Done column always remain
// (otherwise new cards or finished work would have nowhere to go).
[ApiController]
[Authorize(Roles = "Projektleiter,Admin")]
[Route("api/projects/{projectId}/boards/{boardId}/columns")]
public class BoardColumnsController : ControllerBase
{
    private readonly PmDbContextBase _db;

    public BoardColumnsController(PmDbContextBase db)
    {
        _db = db;
    }

    private static BoardColumnDto ToDto(BoardColumn c) => new(c.Id, c.Name, c.Order, c.WipLimit, c.Type, c.IsDefault, c.IsHidden);

    private Task<Board?> LoadBoardAsync(string projectId, string boardId) =>
        _db.Boards.Include(b => b.Columns).FirstOrDefaultAsync(b => b.Id == boardId && b.ProjectId == projectId);

    private static string? CheckInvariants(IEnumerable<BoardColumn> columnsAfterChange)
    {
        var visible = columnsAfterChange.Where(c => !c.IsHidden).ToList();
        if (!visible.Any(c => c.Type == BoardColumnType.Todo) || !visible.Any(c => c.Type == BoardColumnType.Done))
        {
            return "Es muss mindestens eine sichtbare Spalte vom Typ Todo (offen) und eine vom Typ Fertig (Done) bleiben.";
        }
        return null;
    }

    private static bool NameTaken(IEnumerable<BoardColumn> columns, string name, Guid? exceptId) =>
        columns.Any(c => c.Id != exceptId && string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));

    [HttpPost]
    public async Task<ActionResult<BoardColumnDto>> Create(string projectId, string boardId, CreateColumnRequest request)
    {
        var board = await LoadBoardAsync(projectId, boardId);
        if (board is null) return NotFound();

        var name = request.Name?.Trim() ?? string.Empty;
        if (name.Length == 0) return BadRequest("Bitte einen Namen für die Spalte angeben.");
        if (name.Length > 60) return BadRequest("Der Name der Spalte darf höchstens 60 Zeichen lang sein.");
        if (!Enum.IsDefined(request.Type)) return BadRequest("Unbekannter Spaltentyp.");
        if (NameTaken(board.Columns, name, null)) return Conflict($"Es gibt in diesem Board schon eine Spalte '{name}'.");

        var column = new BoardColumn
        {
            BoardId = boardId,
            Name = name,
            Type = request.Type,
            Order = board.Columns.Count == 0 ? 0 : board.Columns.Max(c => c.Order) + 1,
        };
        _db.BoardColumns.Add(column);
        await _db.SaveChangesAsync();
        return Ok(ToDto(column));
    }

    [HttpPut("{columnId:guid}")]
    public async Task<ActionResult<BoardColumnDto>> Update(string projectId, string boardId, Guid columnId, UpdateColumnRequest request)
    {
        var board = await LoadBoardAsync(projectId, boardId);
        var column = board?.Columns.FirstOrDefault(c => c.Id == columnId);
        if (board is null || column is null) return NotFound();

        var renaming = request.Name is not null && request.Name.Trim() != column.Name;
        var retyping = request.Type is not null && request.Type != column.Type;
        if (column.IsDefault && (renaming || retyping))
        {
            return BadRequest($"Die Standard-Spalte '{column.Name}' lässt sich nur ein- oder ausblenden, nicht umbenennen oder umtypisieren.");
        }

        if (renaming)
        {
            var name = request.Name!.Trim();
            if (name.Length == 0) return BadRequest("Bitte einen Namen für die Spalte angeben.");
            if (name.Length > 60) return BadRequest("Der Name der Spalte darf höchstens 60 Zeichen lang sein.");
            if (NameTaken(board.Columns, name, columnId)) return Conflict($"Es gibt in diesem Board schon eine Spalte '{name}'.");
            column.Name = name;
        }

        if (retyping)
        {
            if (!Enum.IsDefined(request.Type!.Value)) return BadRequest("Unbekannter Spaltentyp.");
            column.Type = request.Type.Value;
        }

        if (request.IsHidden is true && !column.IsHidden)
        {
            var cards = await _db.WorkItems.CountAsync(w => w.ColumnId == columnId);
            if (cards > 0)
            {
                return Conflict($"Die Spalte '{column.Name}' enthält noch {cards} Karte(n). Verschiebe sie zuerst in eine andere Spalte, dann lässt sie sich ausblenden.");
            }
        }
        if (request.IsHidden is not null) column.IsHidden = request.IsHidden.Value;

        var problem = CheckInvariants(board.Columns);
        if (problem is not null) return Conflict(problem);

        await _db.SaveChangesAsync();
        return Ok(ToDto(column));
    }

    [HttpDelete("{columnId:guid}")]
    public async Task<IActionResult> Delete(string projectId, string boardId, Guid columnId)
    {
        var board = await LoadBoardAsync(projectId, boardId);
        var column = board?.Columns.FirstOrDefault(c => c.Id == columnId);
        if (board is null || column is null) return NotFound();

        if (column.IsDefault)
        {
            return BadRequest($"Die Standard-Spalte '{column.Name}' lässt sich nicht löschen, nur ausblenden.");
        }

        var cards = await _db.WorkItems.CountAsync(w => w.ColumnId == columnId);
        if (cards > 0)
        {
            return Conflict($"Die Spalte '{column.Name}' enthält noch {cards} Karte(n). Verschiebe sie zuerst in eine andere Spalte.");
        }

        var problem = CheckInvariants(board.Columns.Where(c => c.Id != columnId));
        if (problem is not null) return Conflict(problem);

        _db.BoardColumns.Remove(column);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("order")]
    public async Task<ActionResult<List<BoardColumnDto>>> Reorder(string projectId, string boardId, ReorderColumnsRequest request)
    {
        var board = await LoadBoardAsync(projectId, boardId);
        if (board is null) return NotFound();

        var ids = request.ColumnIds ?? [];
        if (ids.Count != board.Columns.Count || !ids.OrderBy(i => i).SequenceEqual(board.Columns.Select(c => c.Id).OrderBy(i => i)))
        {
            return BadRequest("Die Reihenfolge muss genau die Spalten dieses Boards enthalten.");
        }

        for (var i = 0; i < ids.Count; i++)
        {
            board.Columns.First(c => c.Id == ids[i]).Order = i;
        }

        await _db.SaveChangesAsync();
        return Ok(board.Columns.OrderBy(c => c.Order).Select(ToDto).ToList());
    }
}
