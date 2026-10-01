using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Boards;
using Milepoint.Api.Models;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId}/boards")]
public class BoardsController : ControllerBase
{
    internal static readonly (string Name, BoardColumnType Type)[] DefaultColumns =
    [
        ("Neu", BoardColumnType.Todo),
        ("In Arbeit", BoardColumnType.InProgress),
        ("Fertig", BoardColumnType.Done),
        ("Pausiert", BoardColumnType.Todo)
    ];

    private readonly PmDbContextBase _db;

    public BoardsController(PmDbContextBase db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<BoardDto>>> GetAll(string projectId)
    {
        var boards = await _db.Boards
            .Where(b => b.ProjectId == projectId)
            .Include(b => b.Columns)
            .OrderBy(b => b.CreatedAt)
            .ToListAsync();

        return Ok(boards.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<BoardDto>> Create(string projectId, CreateBoardRequest request)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId);
        if (!projectExists)
        {
            return NotFound();
        }

        List<BoardColumn> columns;
        if (request.ColumnNames is { Count: > 0 })
        {
            columns = request.ColumnNames
                .Select((name, index) => new BoardColumn { Name = name, Order = index, Type = InferColumnType(name) })
                .ToList();
        }
        else
        {
            columns = DefaultColumns
                .Select((c, index) => new BoardColumn { Name = c.Name, Order = index, Type = c.Type, IsDefault = true })
                .ToList();
        }

        var board = new Board
        {
            ProjectId = projectId,
            Name = request.Name,
            Columns = columns
        };

        _db.Boards.Add(board);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new { projectId }, ToDto(board));
    }

    // Custom column names don't come with an explicit type, so guess from common German/English
    // keywords. Falls back to Todo, which is the safe default (won't be miscounted as "done").
    private static BoardColumnType InferColumnType(string name)
    {
        var lower = name.ToLowerInvariant();

        if (lower.Contains("fertig") || lower.Contains("done") || lower.Contains("erledigt") || lower.Contains("closed"))
        {
            return BoardColumnType.Done;
        }

        if (lower.Contains("arbeit") || lower.Contains("progress") || lower.Contains("review") || lower.Contains("bearbeitung"))
        {
            return BoardColumnType.InProgress;
        }

        return BoardColumnType.Todo;
    }

    private static BoardDto ToDto(Board board) => new(
        board.Id,
        board.Name,
        board.CreatedAt,
        board.Columns
            .OrderBy(c => c.Order)
            .Select(c => new BoardColumnDto(c.Id, c.Name, c.Order, c.WipLimit, c.Type, c.IsDefault, c.IsHidden))
            .ToList());
}
