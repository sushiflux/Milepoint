using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Users;

namespace Milepoint.Api.Controllers;

// Local user management - Admin role only. An admin can never touch an account of the same or a
// higher rank than their own (so: no deleting, demoting or resetting the password of yourself or
// of another admin) - checked here on the server, the UI merely mirrors it.
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin/users")]
public class AdminUsersController : ControllerBase
{
    private static readonly string[] RoleNames = ["User", "Projektleiter", "Admin"];

    private readonly PmDbContextBase _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public AdminUsersController(PmDbContextBase db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    // One role per account; Admin ranks above Projektleiter above User and inherits their rights
    // (ProjectsController treats Admin like Projektleiter), so no account needs two roles.
    private static string[] RolesFor(string role) => role switch
    {
        "Admin" => ["Admin"],
        "Projektleiter" => ["Projektleiter"],
        _ => ["User"],
    };

    private static int Rank(IEnumerable<string> roles)
    {
        var rank = 0;
        foreach (var role in roles)
        {
            var index = Array.IndexOf(RoleNames, role);
            if (index + 1 > rank) rank = index + 1;
        }
        return Math.Max(rank, 1);
    }

    private static string RoleOf(IEnumerable<string> roles) => RoleNames[Rank(roles) - 1];

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")
        ?? string.Empty;

    [HttpGet]
    public async Task<ActionResult<List<AdminUserDto>>> GetAll()
    {
        var me = CurrentUserId;
        var myRank = Rank(User.FindAll(ClaimTypes.Role).Select(c => c.Value));

        var users = await _db.Users.OrderBy(u => u.UserName).ToListAsync();
        var rolesByUser = await (
            from ur in _db.UserRoles
            join r in _db.Roles on ur.RoleId equals r.Id
            select new { ur.UserId, Role = r.Name! }).ToListAsync();
        var ownedCounts = await _db.Projects
            .GroupBy(p => p.CreatedByUserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count);

        var result = users.Select(u =>
        {
            var roles = rolesByUser.Where(x => x.UserId == u.Id).Select(x => x.Role).ToList();
            var isSelf = u.Id == me;
            return new AdminUserDto(
                u.Id,
                u.UserName!,
                u.DisplayName,
                u.Email,
                RoleOf(roles),
                isSelf,
                CanModify: !isSelf && Rank(roles) < myRank,
                OwnedProjects: ownedCounts.GetValueOrDefault(u.Id));
        }).ToList();

        return Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<AdminUserDto>> Create(CreateAdminUserRequest request)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        if (username.Length < 3)
        {
            return BadRequest("Benutzername: mindestens 3 Zeichen erforderlich.");
        }
        if (!RoleNames.Contains(request.Role))
        {
            return BadRequest($"Rolle '{request.Role}' ist unbekannt (erlaubt: Benutzer, Projektleiter, Admin).");
        }
        if (await _userManager.FindByNameAsync(username) is not null)
        {
            return Conflict($"Der Benutzername '{username}' ist bereits vergeben.");
        }

        var user = new ApplicationUser
        {
            UserName = username,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? username : request.DisplayName.Trim(),
            Email = string.IsNullOrWhiteSpace(request.Email) ? $"{username}@milepoint.local" : request.Email.Trim(),
            EmailConfirmed = true,
        };

        var created = await _userManager.CreateAsync(user, request.Password ?? string.Empty);
        if (!created.Succeeded)
        {
            return BadRequest("Benutzer konnte nicht angelegt werden: " + string.Join(" ", created.Errors.Select(e => e.Description)));
        }

        await _userManager.AddToRolesAsync(user, RolesFor(request.Role));

        return Ok(new AdminUserDto(user.Id, user.UserName!, user.DisplayName, user.Email, request.Role,
            IsSelf: false, CanModify: Rank(RolesFor(request.Role)) < Rank(["Admin"]), OwnedProjects: 0));
    }

    [HttpPut("{id}/role")]
    public async Task<IActionResult> UpdateRole(string id, UpdateUserRoleRequest request)
    {
        if (!RoleNames.Contains(request.Role))
        {
            return BadRequest($"Rolle '{request.Role}' ist unbekannt (erlaubt: Benutzer, Projektleiter, Admin).");
        }

        var (user, error) = await FindModifiableAsync(id, "ändern");
        if (error is not null) return error;

        var current = await _userManager.GetRolesAsync(user!);
        await _userManager.RemoveFromRolesAsync(user!, current);
        await _userManager.AddToRolesAsync(user!, RolesFor(request.Role));
        return NoContent();
    }

    [HttpPut("{id}/password")]
    public async Task<IActionResult> ResetPassword(string id, ResetUserPasswordRequest request)
    {
        var (user, error) = await FindModifiableAsync(id, "ändern");
        if (error is not null) return error;

        var token = await _userManager.GeneratePasswordResetTokenAsync(user!);
        var result = await _userManager.ResetPasswordAsync(user!, token, request.Password ?? string.Empty);
        if (!result.Succeeded)
        {
            return BadRequest("Passwort konnte nicht gesetzt werden: " + string.Join(" ", result.Errors.Select(e => e.Description)));
        }
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var (user, error) = await FindModifiableAsync(id, "löschen");
        if (error is not null) return error;

        // Project.CreatedByUser is a Restrict relation - refuse with a readable reason instead of
        // letting the database throw a foreign-key error.
        var owned = await _db.Projects.CountAsync(p => p.CreatedByUserId == user!.Id);
        if (owned > 0)
        {
            return Conflict($"'{user!.UserName}' hat {owned} Projekt(e) angelegt und kann deshalb nicht gelöscht werden. " +
                "Lösche oder übergib zuerst diese Projekte.");
        }

        var result = await _userManager.DeleteAsync(user!);
        if (!result.Succeeded)
        {
            return BadRequest("Benutzer konnte nicht gelöscht werden: " + string.Join(" ", result.Errors.Select(e => e.Description)));
        }
        return NoContent();
    }

    // Shared guard for role change / password reset / delete: never yourself, never the same or a
    // higher rank.
    private async Task<(ApplicationUser? User, ActionResult? Error)> FindModifiableAsync(string id, string verb)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null)
        {
            return (null, NotFound("Benutzer nicht gefunden."));
        }
        if (user.Id == CurrentUserId)
        {
            return (null, StatusCode(StatusCodes.Status403Forbidden, $"Du kannst dein eigenes Konto nicht {verb}."));
        }

        var myRank = Rank(User.FindAll(ClaimTypes.Role).Select(c => c.Value));
        if (Rank(await _userManager.GetRolesAsync(user)) >= myRank)
        {
            return (null, StatusCode(StatusCodes.Status403Forbidden,
                $"'{user.UserName}' hat die gleiche oder eine höhere Rolle als du - das Konto lässt sich nicht {verb}."));
        }

        return (user, null);
    }
}
