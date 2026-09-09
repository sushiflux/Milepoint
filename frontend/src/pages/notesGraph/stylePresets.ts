import type { NoteEdgeArrow, NoteEdgeStyle, NoteShape } from '../../api/types'
import type { TreeLayoutId } from './treeLayouts'

// Vordefinierte Gesamt-Stile ("Stil-Vorlagen") für die Notizen-Graph-Ansichten - kombinieren
// Layout + Farbschema (aus colorSchemes.ts) + Form + Linienstil + Pfeilspitzen zu einer fertigen,
// mit einem Klick anwendbaren Kombination. Benennung orientiert sich bewusst an den bereits
// bestehenden Farbschema-Namen aus colorSchemes.ts, damit "Modern" etc. nicht zweimal etwas
// anderes bedeutet.

export type GraphLayoutId = 'free' | TreeLayoutId

export interface StylePreset {
  id: string
  label: string
  description: string
  layout: GraphLayoutId
  colorSchemeId: string
  shape: NoteShape
  edgeStyle: NoteEdgeStyle
  edgeArrow: NoteEdgeArrow
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'classic',
    label: 'Klassisch',
    description: 'Mind Map, Standard-Palette, abgerundet, durchgezogene Linien',
    layout: 'mindmap',
    colorSchemeId: 'default',
    shape: 'Rounded',
    edgeStyle: 'Solid',
    edgeArrow: 'None',
  },
  {
    id: 'modern',
    label: 'Modern',
    description: 'Baum (links → rechts), lebendige Palette, Rechtecke, gestrichelt mit Pfeilspitzen',
    layout: 'tree-horizontal',
    colorSchemeId: 'vivid',
    shape: 'Rectangle',
    edgeStyle: 'Dashed',
    edgeArrow: 'End',
  },
  {
    id: 'soft',
    label: 'Sanft',
    description: 'Mind Map, Pastell-Palette, Oval, gepunktete Linien',
    layout: 'mindmap',
    colorSchemeId: 'pastel',
    shape: 'Ellipse',
    edgeStyle: 'Dotted',
    edgeArrow: 'None',
  },
  {
    id: 'corporate',
    label: 'Organigramm',
    description: 'Organigramm (oben → unten), Ozean-Palette, Rechtecke, durchgezogen mit Pfeilspitzen',
    layout: 'tree-vertical',
    colorSchemeId: 'ocean',
    shape: 'Rectangle',
    edgeStyle: 'Solid',
    edgeArrow: 'End',
  },
  {
    id: 'analysis',
    label: 'Analyse',
    description: 'Fischgräten, Sonnenuntergang-Palette, Raute, durchgezogene Linien',
    layout: 'fishbone',
    colorSchemeId: 'sunset',
    shape: 'Diamond',
    edgeStyle: 'Solid',
    edgeArrow: 'None',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Freie Ansicht, Wald-Palette, unterstrichen, gepunktete Linien ohne Pfeilspitzen',
    layout: 'free',
    colorSchemeId: 'forest',
    shape: 'Underline',
    edgeStyle: 'Dotted',
    edgeArrow: 'None',
  },
]
