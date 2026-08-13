using Milepoint.Api.Models;

namespace Milepoint.Api.Services;

// TCK# (Ticket: Bug/Epic - problems and larger tracked items) vs TSK# (Aufgabe/Task: Task/Feature -
// assignable planned work), each with its own global, project-independent counter.
public static class WorkItemReferenceCode
{
    public const string TicketCounterKey = "Ticket";
    public const string TaskCounterKey = "Task";

    public static string PrefixFor(WorkItemType type) => type switch
    {
        WorkItemType.Bug => "TCK",
        WorkItemType.Epic => "TCK",
        WorkItemType.Task => "TSK",
        WorkItemType.Feature => "TSK",
        _ => "TSK"
    };

    public static string CounterKeyFor(WorkItemType type) =>
        PrefixFor(type) == "TCK" ? TicketCounterKey : TaskCounterKey;

    public static string Format(string prefix, int number) => $"{prefix}#{number:D5}";
}
