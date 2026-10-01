using Milepoint.Api.Models;

namespace Milepoint.Api.Dtos.Boards;

public record CreateBoardRequest(string Name, List<string>? ColumnNames);

public record BoardColumnDto(Guid Id, string Name, int Order, int? WipLimit, BoardColumnType Type, bool IsDefault, bool IsHidden);

public record CreateColumnRequest(string Name, BoardColumnType Type);

public record UpdateColumnRequest(string? Name, BoardColumnType? Type, bool? IsHidden);

public record ReorderColumnsRequest(List<Guid> ColumnIds);

public record ProjectCategoryDto(Guid Id, string Name, string Color, bool IsDefault, bool IsHidden, int Order);

public record CreateCategoryRequest(string Name, string Color);

public record UpdateCategoryRequest(string? Name, string? Color, bool? IsHidden);

public record BoardDto(string Id, string Name, DateTimeOffset CreatedAt, List<BoardColumnDto> Columns);
