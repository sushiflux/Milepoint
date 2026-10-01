using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Milepoint.Api.Auth;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Auth;

namespace Milepoint.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly TokenService _tokenService;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        TokenService tokenService)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _tokenService = tokenService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var user = new ApplicationUser
        {
            UserName = request.Username,
            Email = request.Email,
            DisplayName = request.DisplayName
        };

        var result = await _userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new { errors = result.Errors.Select(e => e.Description) });
        }

        await _userManager.AddToRoleAsync(user, "User");
        var roles = await _userManager.GetRolesAsync(user);

        var (token, expiresAt) = _tokenService.CreateToken(user, roles);
        return Ok(new AuthResponse(token, expiresAt, user.UserName!, user.Email!, user.DisplayName, roles.ToList()));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await _userManager.FindByNameAsync(request.Username);
        if (user is null)
        {
            return Unauthorized();
        }

        var result = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (!result.Succeeded)
        {
            return Unauthorized();
        }

        var roles = await _userManager.GetRolesAsync(user);
        var (token, expiresAt) = _tokenService.CreateToken(user, roles);
        return Ok(new AuthResponse(token, expiresAt, user.UserName!, user.Email!, user.DisplayName, roles.ToList()));
    }

    [HttpGet("username-available")]
    public async Task<IActionResult> UsernameAvailable([FromQuery] string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return Ok(new { available = false });
        }

        var existing = await _userManager.FindByNameAsync(username);
        return Ok(new { available = existing is null });
    }

    // The signed-in user changes their OWN password: the current one has to be typed again, so a
    // stolen/left-open session alone can't take over the account. Messages are specific because the
    // settings form shows them as-is.
    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrEmpty(request.NewPassword))
        {
            return BadRequest("Bitte ein neues Passwort eingeben.");
        }
        if (request.NewPassword == request.CurrentPassword)
        {
            return BadRequest("Das neue Passwort muss sich vom aktuellen unterscheiden.");
        }

        var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword ?? string.Empty, request.NewPassword);
        if (result.Succeeded)
        {
            return NoContent();
        }

        if (result.Errors.Any(e => e.Code == "PasswordMismatch"))
        {
            return BadRequest("Das aktuelle Passwort ist falsch.");
        }

        return BadRequest("Passwort konnte nicht geändert werden: " + string.Join(" ", result.Errors.Select(e => e.Description)));
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
        {
            return Unauthorized();
        }

        var roles = await _userManager.GetRolesAsync(user);
        return Ok(new { user.UserName, user.Email, user.DisplayName, Roles = roles });
    }
}
