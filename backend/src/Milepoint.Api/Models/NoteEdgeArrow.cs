namespace Milepoint.Api.Models;

// Arrowhead placement for every line drawn FROM this note (Note.EdgeArrow) - same per-note scope
// as NoteEdgeStyle (see that file's doc comment): applies uniformly to this note's outgoing
// cross-links and its edges to its own children, not configurable per individual connection.
// "Start"/"End" refer to the line's direction as drawn from this note (the source/parent side) to
// the other note (the target/child side) - End = arrowhead at the target/child, Start = arrowhead
// at this note itself, Both = arrowheads at both ends. Same "real enum, null = view default"
// reasoning as NoteShape.
public enum NoteEdgeArrow
{
    // No arrowhead - the style every edge already rendered as before this feature existed.
    None,
    // Arrowhead only at the end of the line (the child / cross-link target side).
    End,
    // Arrowhead only at the start of the line (this note / the parent side).
    Start,
    // Arrowheads at both ends.
    Both
}
