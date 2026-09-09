namespace Milepoint.Api.Models;

// Line style for every line drawn FROM this note (Note.EdgeStyle) - applies uniformly to both this
// note's outgoing free cross-links (OutgoingLinks/NoteLink) and its edges to its own children
// (ChildNotes) in the graph/tree views. A per-note setting, not a per-connection one: the frontend
// doesn't offer styling individual links, only the note they originate from. Same "real enum so an
// invalid value is rejected server-side, null = view default" reasoning as NoteShape - see that
// file's doc comment.
public enum NoteEdgeStyle
{
    // Continuous line - the style every edge already rendered as before this feature existed.
    Solid,
    // Dashed line.
    Dashed,
    // Dotted line.
    Dotted,
    // Continuous line whose opacity fades toward transparent at both endpoints and is fully
    // opaque at its midpoint (an SVG linearGradient on the stroke) - a softer, more polished look
    // than a flat-opacity line, applied to the line only, never the arrowhead marker.
    Gradient
    // A "Glow" option (blurred halo behind the line) was tried and removed again per explicit
    // user feedback ("den Leuchteneffekt... kannst Du bitte rausnehmen") - deliberately not kept
    // around as a disabled/hidden option, since the user rejected the visual outright rather than
    // just not using it. Its enum value (4, after Gradient) is retired, not reused - no other
    // value moves, so this isn't a breaking change for any Solid/Dashed/Dotted/Gradient value
    // already stored.
}
