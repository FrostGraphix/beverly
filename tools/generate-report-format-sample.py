from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas

OUT = 'output/pdf/beverly-wallet-report-format-sample.pdf'
W, H = A4
INK = HexColor('#12231D')
GREEN = HexColor('#146848')
LEAF = HexColor('#70AB6B')
MIST = HexColor('#E8F2EB')
LINE = HexColor('#CDE0D4')
MUTED = HexColor('#5C7066')

def text(c, x, y, value, size=9, color=INK, bold=False):
    c.setFillColor(color)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    c.drawString(x, y, value)

def header(c, title, kicker):
    c.setFillColor(INK); c.rect(0, H - 26*mm, W, 26*mm, fill=1, stroke=0)
    c.setFillColor(GREEN); c.rect(0, H - 26*mm, 5*mm, 26*mm, fill=1, stroke=0)
    text(c, 16*mm, H - 10*mm, kicker.upper(), 7, LEAF, True)
    text(c, 16*mm, H - 19*mm, title, 18, HexColor('#FFFFFF'), True)
    text(c, W - 42*mm, H - 19*mm, 'BEVERLY', 8, HexColor('#FFFFFF'), True)

def footer(c, page):
    c.setStrokeColor(LINE); c.line(16*mm, 12*mm, W-16*mm, 12*mm)
    text(c, 16*mm, 7*mm, 'CONFIDENTIAL | Beverly Wallet Operations', 7, MUTED)
    text(c, W-28*mm, 7*mm, f'{page} / 3', 7, MUTED)

def page_one(c):
    header(c, 'Financial Report', 'Executive report')
    text(c, 16*mm, H-36*mm, '01 May 2026 to 31 May 2026 | 31 days', 9, MUTED)
    cards = [('REVENUE', 'N12.8M', '3,482 delivered'), ('ENERGY VALUE', 'N11.7M', 'Token value'), ('FUNDING INFLOW', 'N9.4M', '1,218 top-ups'), ('SUCCESS RATE', '98.7%', '44 failed'), ('SETTLEMENT NET', 'N8.1M', '12 batches'), ('DISPUTES OPENED', '26', '14 refunds')]
    for i, (label, value, note) in enumerate(cards):
        col, row = i % 3, i // 3
        x, y = 16*mm + col*61*mm, H - 73*mm - row*33*mm
        c.setFillColor(HexColor('#FFFFFF')); c.setStrokeColor(LINE); c.roundRect(x, y, 56*mm, 26*mm, 2*mm, fill=1, stroke=1)
        text(c, x+4*mm, y+18*mm, label, 6, MUTED, True); text(c, x+4*mm, y+11*mm, value, 14, INK, True); text(c, x+4*mm, y+5*mm, note, 6, MUTED)
    text(c, 16*mm, H-150*mm, 'Revenue performance', 11, INK, True)
    c.setFillColor(MIST); c.rect(16*mm, H-207*mm, W-32*mm, 48*mm, fill=1, stroke=0)
    bars = [20, 30, 24, 38, 31, 44, 40, 51, 47, 58, 54, 68]
    for i, v in enumerate(bars):
        c.setFillColor(GREEN if i == len(bars)-1 else LEAF); c.roundRect(20*mm+i*14*mm, H-203*mm, 8*mm, v/2*mm, 1*mm, fill=1, stroke=0)
    text(c, 16*mm, H-220*mm, 'Designed reports. Auto-downloaded PDF. Green system.', 9, MUTED)
    footer(c, 1)

def page_two(c):
    header(c, 'Financial Report', 'Performance breakdown')
    text(c, 16*mm, H-38*mm, 'Top stations', 11, INK, True)
    headers = ['Station', 'Successful vends', 'Revenue']; xs = [16*mm, 93*mm, 145*mm]
    for x, h in zip(xs, headers): text(c, x, H-48*mm, h.upper(), 7, MUTED, True)
    rows = [('Lafia Central', '914', 'N3.12M'), ('Keffi South', '788', 'N2.84M'), ('Akwanga Hub', '622', 'N2.10M'), ('Karu Metro', '545', 'N1.89M'), ('Doma West', '406', 'N1.22M')]
    for i, row in enumerate(rows):
        y = H - 58*mm - i*11*mm
        if i % 2 == 0: c.setFillColor(MIST); c.rect(16*mm, y-4*mm, W-32*mm, 8*mm, fill=1, stroke=0)
        for x, value in zip(xs, row): text(c, x, y, value, 8, GREEN if x == xs[-1] else INK, x == xs[-1])
    text(c, 16*mm, H-130*mm, 'Revenue channels', 11, INK, True)
    for i, (name, pct, value) in enumerate([('Vendor', 72, 'N9.2M'), ('Customer', 20, 'N2.5M'), ('Admin adjustment', 8, 'N1.1M')]):
        y = H - 142*mm - i*14*mm; text(c, 16*mm, y, name, 8); c.setFillColor(MIST); c.roundRect(60*mm, y-3*mm, 80*mm, 3*mm, 1.5*mm, fill=1, stroke=0); c.setFillColor(LEAF); c.roundRect(60*mm, y-3*mm, pct*.8*mm, 3*mm, 1.5*mm, fill=1, stroke=0); text(c, 150*mm, y, value, 8, GREEN, True)
    footer(c, 2)

def page_three(c):
    header(c, 'Financial Report', 'Daily appendix')
    text(c, 16*mm, H-38*mm, 'Daily operational series', 11, INK, True)
    headers = ['Date', 'Revenue', 'Purchases', 'Funding', 'Refunds', 'New customers']; xs = [16*mm, 42*mm, 75*mm, 103*mm, 134*mm, 164*mm]
    for x, h in zip(xs, headers): text(c, x, H-48*mm, h.upper(), 6, MUTED, True)
    for i in range(15):
        y = H - 58*mm - i*10*mm
        if i % 2 == 0: c.setFillColor(MIST); c.rect(16*mm, y-3*mm, W-32*mm, 7*mm, fill=1, stroke=0)
        vals = [f'{i+1:02d} May', f'N{312+i*19}K', str(80+i*7), f'N{221+i*12}K', f'N{8+i}K', str(4+i%5)]
        for x, val in zip(xs, vals): text(c, x, y, val, 7, GREEN if x == xs[1] else INK, x == xs[1])
    footer(c, 3)

if __name__ == '__main__':
    import os
    os.makedirs('output/pdf', exist_ok=True)
    canvas = Canvas(OUT, pagesize=A4)
    page_one(canvas); canvas.showPage(); page_two(canvas); canvas.showPage(); page_three(canvas); canvas.save()
