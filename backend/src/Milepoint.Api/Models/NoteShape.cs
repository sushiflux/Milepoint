namespace Milepoint.Api.Models;

// Node shape for a note as rendered in the graph/tree views (Note.Shape). A real enum rather than
// a free string so an invalid value is rejected server-side (model binding on an enum-typed
// request property already returns 400 for a string that doesn't match a member - see
// NotesController for where this is verified) instead of silently persisting garbage the frontend
// then has to defensively handle. Null on the entity/DTO means "no explicit shape chosen" -
// distinct from Rounded, which is an explicit choice that happens to match the visual default.
public enum NoteShape
{
    // Rounded-rectangle - the shape every note already rendered as before this feature existed.
    Rounded,
    // Square-cornered rectangle.
    Rectangle,
    // Diamond/rhombus.
    Diamond,
    // No visible border/background - just the title text with an underline.
    Underline,
    // Ellipse/oval (circle for short titles).
    Ellipse
}
