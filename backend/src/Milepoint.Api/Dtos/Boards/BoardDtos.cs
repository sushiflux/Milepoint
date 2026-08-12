namespace Milepoint.Api.Dtos.Boards;

public record CreateBoardRequest(string Name, List<string>? ColumnNames);

public record BoardColumnDto(Guid Id, string Name, int Order, int? WipLimit);

public record BoardDto(Guid Id, string Name, DateTimeOffset CreatedAt, List<BoardColumnDto> Columns);
