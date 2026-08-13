using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Users;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly PmDbContextBase _db;

    public UsersController(PmDbContextBase db)
    {
        _db = db;
    }

    // Minimal directory for assignment dropdowns etc. - just enough to pick a user, not a full profile.
    [HttpGet]
    public async Task<ActionResult<List<UserSummaryDto>>> GetAll()
    {
        var users = await _db.Users
            .OrderBy(u => u.DisplayName)
            .Select(u => new UserSummaryDto(u.Id, u.UserName!, u.DisplayName))
            .ToListAsync();

        return Ok(users);
    }
}
