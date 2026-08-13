namespace Milepoint.Api.Models;

// Backs the global, provider-portable TCK#/TSK# ticket/task numbering (see WorkItemReferenceCode).
public class SequenceCounter
{
    public string Key { get; set; } = string.Empty;
    public int Value { get; set; }
}
