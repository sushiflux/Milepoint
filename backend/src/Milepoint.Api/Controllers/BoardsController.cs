using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Boards;
using Milepoint.Api.Models;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId:guid}/boards")]
public class BoardsController : ControllerBase
{
    private readonly PmDbContextBase _db;

    public BoardsController(PmDbContextBase db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<BoardDto>>> GetAll(Guid projectId)
    {
        var boards = await _db.Boards
            .Where(b => b.ProjectId == projectId)
            .Include(b => b.Columns)
            .OrderBy(b => b.CreatedAt)
            .ToListAsync();

        return Ok(boards.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<BoardDto>> Create(Guid projectId, CreateBoardRequest request)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId);
        if (!projectExists)
        {
            return NotFound();
        }

        var columnNames = request.ColumnNames is { Count: > 0 }
            ? request.ColumnNames
            : new List<string> { "Backlog", "In Arbeit", "Review", "Fertig" };

        var board = new Board
        {
            ProjectId = projectId,
            Name = request.Name,
            Columns = columnNames
                .Select((name, index) => new BoardColumn { Name = name, Order = index })
                .ToList()
        };

        _db.Boards.Add(board);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new { projectId }, ToDto(board));
    }

    private static BoardDto ToDto(Board board) => new(
        board.Id,
        board.Name,
        board.CreatedAt,
        board.Columns
            .OrderBy(c => c.Order)
            .Select(c => new BoardColumnDto(c.Id, c.Name, c.Order, c.WipLimit))
            .ToList());
}
