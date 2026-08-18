using Milepoint.Api.Data;

namespace Milepoint.Api.Models;

// Generic per-user key/value store for UI preferences (theme, sort order, collapsed/expanded
// state, view mode, ...) - client-side settings still need to live somewhere durable rather than
// localStorage, so they follow the user across devices/browsers instead of being tab-local.
public class UserPreference
{
    public string UserId { get; set; } = string.Empty;
    public ApplicationUser User { get; set; } = null!;

    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
