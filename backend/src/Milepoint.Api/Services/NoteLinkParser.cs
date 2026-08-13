using System.Text.RegularExpressions;

namespace Milepoint.Api.Services;

public static partial class NoteLinkParser
{
    public static IReadOnlyList<string> ExtractLinkTitles(string content) =>
        LinkPattern()
            .Matches(content)
            .Select(m => m.Groups[1].Value.Trim())
            .Where(title => title.Length > 0)
            .Distinct()
            .ToList();

    [GeneratedRegex(@"\[\[([^\[\]]+)\]\]")]
    private static partial Regex LinkPattern();
}
