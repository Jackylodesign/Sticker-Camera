import SwiftUI

struct ContentView: View {
    var body: some View {
        ZStack {
            Color(red: 14 / 255, green: 14 / 255, blue: 14 / 255)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                LogoMark()
                    .stroke(.white, style: StrokeStyle(lineWidth: 4.4, lineCap: .round, lineJoin: .round))
                    .frame(width: 44, height: 44)
                Text("Sticker Index")
                    .font(.title.bold())
                Text("Your first iPhone app.")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// The Sticker Index mark (a sticker with its corner peeling up). Same drawing as lib/logo.ts.
struct LogoMark: Shape {
    func path(in rect: CGRect) -> Path {
        let unit = rect.width / 24
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * unit, y: rect.minY + y * unit)
        }

        var path = Path()
        // The sheet, with the top-right corner cut off.
        path.move(to: point(14, 3))
        path.addArc(tangent1End: point(3, 3), tangent2End: point(3, 6), radius: 3 * unit)
        path.addArc(tangent1End: point(3, 21), tangent2End: point(6, 21), radius: 3 * unit)
        path.addArc(tangent1End: point(21, 21), tangent2End: point(21, 18), radius: 3 * unit)
        path.addLine(to: point(21, 10))
        // The corner folded back.
        path.move(to: point(14, 3))
        path.addArc(tangent1End: point(14, 10), tangent2End: point(17, 10), radius: 3 * unit)
        path.addLine(to: point(21, 10))
        path.closeSubpath()
        return path
    }
}

#Preview {
    ContentView()
}
