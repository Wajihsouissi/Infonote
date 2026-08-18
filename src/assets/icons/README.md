# App icons

Solar Bold Duotone by [480 Design](https://www.figma.com/community/file/1166831539721848736),
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

**Attribution is required.** Credit Solar / 480 Design somewhere visible in the
product before shipping.

## How this folder works

Every file is named after the lucide icon it replaces — `Home.svg` replaces
`Home`, `FileText.svg` replaces `FileText`. The icon layer in
`src/components/icons` picks them up automatically through `import.meta.glob`,
so dropping a new `<LucideName>.svg` in here swaps that icon across the whole
app with no code change. Any name without a file here keeps rendering the
lucide original.

SVGs use `fill="currentColor"`, so they inherit text color like lucide did.
They do **not** respond to `strokeWidth` — duotone is filled paths, not strokes.

## Still falling back to lucide (25)

No Solar Bold Duotone equivalent exists for these. Drop a matching
`<Name>.svg` in this folder to replace one.

- `ChevronsDownUp.svg`
- `Circle.svg`
- `Columns2.svg`
- `Columns3.svg`
- `Heading.svg`
- `Heading1.svg`
- `Heading2.svg`
- `Heading3.svg`
- `ImagePlay.svg`
- `KanbanSquare.svg`
- `ListOrdered.svg`
- `Loader.svg`
- `Loader2.svg`
- `MailPlus.svg`
- `Move.svg`
- `PanelTop.svg`
- `Quote.svg`
- `RectangleHorizontal.svg`
- `Rows2.svg`
- `Rows3.svg`
- `Square.svg`
- `Squircle.svg`
- `Table.svg`
- `Table2.svg`
- `ToggleRight.svg`
