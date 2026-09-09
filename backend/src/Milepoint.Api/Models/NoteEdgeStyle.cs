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
    Dotted
}
