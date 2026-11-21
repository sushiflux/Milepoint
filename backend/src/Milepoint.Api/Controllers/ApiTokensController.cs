using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.ApiTokens;
using Milepoint.Api.Models;
using Milepoint.Api.Services;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/auth/tokens")]
public class ApiTokensController : ControllerBase
{
    private const int MaxNameLength = 100;
    private const int MaxTokensPerUser = 50;

    private readonly PmDbContextBase _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public ApiTokensController(PmDbContextBase db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    [HttpGet]
    public async Task<ActionResult<List<ApiTokenDto>>> GetAll()
    {
        var userId = _userManager.GetUserId(User);
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var tokens = await _db.ApiTokens
            .Where(t => t.UserId == userId)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new ApiTokenDto(t.Id, t.Name, t.TokenPrefix, t.CreatedAt, t.ExpiresAt, t.LastUsedAt))
            .ToListAsync();

        return Ok(tokens);
    }

    [HttpPost]
    public async Task<ActionResult<CreatedApiTokenResponse>> Create(CreateApiTokenRequest request)
    {
        var userId = _userManager.GetUserId(User);
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var name = request.Name.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return BadRequest("Bitte gib einen Namen für das API-Token an.");
        }

        if (name.Length > MaxNameLength)
        {
            return BadRequest($"Der Token-Name darf höchstens {MaxNameLength} Zeichen lang sein.");
        }

        if (request.ExpiresInDays is <= 0)
        {
            return BadRequest("Die Ablaufzeit muss größer als 0 Tage sein.");
        }

        var existingCount = await _db.ApiTokens.CountAsync(t => t.UserId == userId);
        if (existingCount >= MaxTokensPerUser)
        {
            return BadRequest($"Es können höchstens {MaxTokensPerUser} aktive API-Tokens pro Konto angelegt werden.");
        }

        var (plainText, displayPrefix, hash) = ApiTokenService.Generate();
        var now = DateTimeOffset.UtcNow;

        var entity = new ApiToken
        {
            UserId = userId,
            Name = name,
            TokenPrefix = displayPrefix,
            TokenHash = hash,
            CreatedAt = now,
            ExpiresAt = request.ExpiresInDays.HasValue ? now.AddDays(request.ExpiresInDays.Value) : null
        };

        _db.ApiTokens.Add(entity);
        await _db.SaveChangesAsync();

        var dto = new ApiTokenDto(entity.Id, entity.Name, entity.TokenPrefix, entity.CreatedAt, entity.ExpiresAt, entity.LastUsedAt);
        return CreatedAtAction(nameof(GetAll), new CreatedApiTokenResponse(dto, plainText));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = _userManager.GetUserId(User);
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var token = await _db.ApiTokens.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (token is null)
        {
            return NotFound("API-Token wurde nicht gefunden.");
        }

        _db.ApiTokens.Remove(token);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
