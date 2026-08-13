using Milepoint.Api.Models;

namespace Milepoint.Api.Dtos.Boards;

public record CreateBoardRequest(string Name, List<string>? ColumnNames);

public record BoardColumnDto(Guid Id, string Name, int Order, int? WipLimit, BoardColumnType Type);

public record BoardDto(string Id, string Name, DateTimeOffset CreatedAt, List<BoardColumnDto> Columns);
