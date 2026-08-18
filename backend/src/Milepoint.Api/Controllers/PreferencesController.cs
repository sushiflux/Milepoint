using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Preferences;
using Milepoint.Api.Models;

namespace Milepoint.Api.Controllers;

// Generic per-user key/value settings store (theme, sort order, collapsed/expanded panels, view
// mode, ...) - the frontend used to keep these in localStorage; they live here instead so a
// preference follows the user across devices/browsers.
[ApiController]
[Authorize]
[Route("api/preferences")]
public class PreferencesController : ControllerBase
{
    private readonly PmDbContextBase _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public PreferencesController(PmDbContextBase db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    [HttpGet]
    public async Task<ActionResult<Dictionary<string, string>>> GetAll()
    {
        var currentUserId = _userManager.GetUserId(User);
        var preferences = await _db.UserPreferences
            .Where(p => p.UserId == currentUserId)
            .ToDictionaryAsync(p => p.Key, p => p.Value);

        return Ok(preferences);
    }

    [HttpPut("{key}")]
    public async Task<IActionResult> Set(string key, SetPreferenceRequest request)
    {
        var currentUserId = _userManager.GetUserId(User);
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var existing = await _db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == currentUserId && p.Key == key);
        if (existing is null)
        {
            _db.UserPreferences.Add(new UserPreference { UserId = currentUserId, Key = key, Value = request.Value });
        }
        else
        {
            existing.Value = request.Value;
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }
}
