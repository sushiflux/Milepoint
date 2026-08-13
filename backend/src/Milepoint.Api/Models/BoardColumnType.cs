namespace Milepoint.Api.Models;

// Independent of the column's free-text name, so progress/stats work the same regardless of how a
// board's columns are labeled (e.g. "Fertig", "Done", "Erledigt" all just become Done columns).
public enum BoardColumnType
{
    Todo,
    InProgress,
    Done
}
