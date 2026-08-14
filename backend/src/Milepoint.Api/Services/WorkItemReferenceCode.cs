using Milepoint.Api.Models;

namespace Milepoint.Api.Services;

// TSK# for every work item type (Task and Phase alike), one global, project-independent counter.
public static class WorkItemReferenceCode
{
    public const string TaskCounterKey = "Task";

    public static string PrefixFor(WorkItemType type) => "TSK";

    public static string CounterKeyFor(WorkItemType type) => TaskCounterKey;

    public static string Format(string prefix, int number) => $"{prefix}#{number:D5}";
}
