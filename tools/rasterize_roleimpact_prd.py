from argparse import ArgumentParser
from pathlib import Path

import pypdfium2 as pdfium


parser = ArgumentParser(description="Render every page of a PDF to PNG images.")
parser.add_argument("pdf", type=Path)
parser.add_argument("output_dir", type=Path)
parser.add_argument("--scale", type=float, default=2.0)
args = parser.parse_args()

args.output_dir.mkdir(parents=True, exist_ok=True)
document = pdfium.PdfDocument(str(args.pdf.resolve()))
for index in range(len(document)):
    page = document[index]
    bitmap = page.render(scale=args.scale)
    image = bitmap.to_pil()
    output_path = args.output_dir / f"page-{index + 1}.png"
    image.save(output_path)
    print(output_path.resolve())
