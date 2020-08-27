---
title: Best way to get DPI value in WPF
date: 2010-08-27T06:25:00.000Z
lastmod: 2015-04-23T17:27:45.000Z
permalink: best-way-to-get-dpi-value-in-wpf
uuid: 23ec76ae-a58f-49ae-ac8a-c2ed86513ba8
tags: WPF
---

WPF is a great presentation platform that requires far less journeys to Win API compared to Windows Forms. Still, there are cases when native calls will do the job better, cleaner and (perhaps) faster. From the top of my head, how would you explicitly place a window on the screen? Yes, there are `Top` and `Left` properties in the `Window` class but if you use them you are going to change the position of the window actually twice and sometimes it can even be noticed and look a bit less professional. To solve this issue you are likely to use `MoveWindow`. There are other cases but I think you get the point.

The problem with native API functions for positioning is that they require coordinates and sizes in pixels while the whole WPF infrastructure talks in terms of independent units (1/96 of an inch). In our example with windows positioning we can get the screen sizes and windows sizes and location in device independent units easily in a WPF application but how do we communicate them in pixels to the native API?

A quick research and Googling with Bing (© [Scott Hanselman](http://www.hanselman.com)) gave at least 4 ways to accomplish that.

## Method 1

It’s the same way you did that in Windows Forms. `System.Drawing.Graphics` object provides convenient properties to get horizontal and vertical DPI. Let’s sketch up a helper method:

```
/// <summary>
/// Transforms device independent units (1/96 of an inch)
/// to pixels
/// </summary>
/// <param name="unitX">a device independent unit value X</param>
/// <param name="unitY">a device independent unit value Y</param>
/// <param name="pixelX">returns the X value in pixels</param>
/// <param name="pixelY">returns the Y value in pixels</param>
public void TransformToPixels(double unitX,
                              double unitY,
                              out int pixelX,
                              out int pixelY)
{
    using (Graphics g = Graphics.FromHwnd(IntPtr.Zero))
    {
        pixelX = (int)((g.DpiX / 96) * unitX);
        pixelY = (int)((g.DpiY / 96) * unitY);
    }

    // alternative:
    // using (Graphics g = Graphics.FromHdc(IntPtr.Zero)) { }
}
```

You can use it transforms both coordinates as well as size values. It’s pretty simple and robust and completely in managed code (at least as far as you, the consumer, is concerned). Passing `IntPtr.Zero` as `HWND` or `HDC` parameter results in a `Graphics` object that wraps a device context of the entire screen.

There is one problem with this approach though. It has a dependency on Windows Forms/GDI+ infrastructure. You are going to have to add a reference to System.Drawing assembly. Big deal? Not sure about you, but for me this is an issue to avoid.

## Method 2

Let’s take it one step deeper and do it the Win API way. `GetDeviceCaps` function retrieves various information for the specified device and is able to retrieve horizontal and vertical DPI’s when we pass it `LOGPIXELSX` and `LOGPIXELSY` parameters respectively.

`GetDeviceCaps` function is defined in gdi32.dll and is probably what `System.Drawing.Graphics` uses under the hood.

Let’s have a look at what our helper has become:

```
[DllImport("gdi32.dll")]
public static extern int GetDeviceCaps(IntPtr hDc, int nIndex);

[DllImport("user32.dll")]
public static extern IntPtr GetDC(IntPtr hWnd);

[DllImport("user32.dll")]
public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDc);

public const int LOGPIXELSX = 88;
public const int LOGPIXELSY = 90;

/// <summary>
/// Transforms device independent units (1/96 of an inch)
/// to pixels
/// </summary>
/// <param name="unitX">a device independent unit value X</param>
/// <param name="unitY">a device independent unit value Y</param>
/// <param name="pixelX">returns the X value in pixels</param>
/// <param name="pixelY">returns the Y value in pixels</param>
public void TransformToPixels(double unitX,
                              double unitY,
                              out int pixelX,
                              out int pixelY)
{
    IntPtr hDc = GetDC(IntPtr.Zero);
    if (hDc != IntPtr.Zero)
    {
        int dpiX = GetDeviceCaps(hDc, LOGPIXELSX);
        int dpiY = GetDeviceCaps(hDc, LOGPIXELSY);

        ReleaseDC(IntPtr.Zero, hDc);

        pixelX = (int)(((double)dpiX / 96) * unitX);
        pixelY = (int)(((double)dpiY / 96) * unitY);
    }
    else
        throw new ArgumentNullException("Failed to get DC.");
}
```

So we have exchanged a dependency on managed GDI+ for the dependency on fancy Win API calls. Is that an improvement? In my opinion yes, as long as we run on Windows Win API is a least common denominator. It is lightweight. On other platforms we wouldn’t probably have this dilemma in the first place.

And don’t get fooled by that `ArgumentNullException`. This solution is as robust as the first one. `System.Drawing.Graphics` will throw this same exception if it can’t obtain a device context too.

## Method 3

As officially documented [here](http://technet.microsoft.com/en-us/library/cc939617.aspx) there is a special key in the registry: `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\FontDPI.` It stores a DWORD value which is exactly what the user chooses for DPI in the display settings dialog (it’s called a font size there).

Reading it is a no-brainer but I wouldn’t recommend it. You see there is a difference between an official API and a storage for various settings. The API is a public contract that stays the same even if the internal logic is totally rewritten (If it doesn’t the whole platform sucks, doesn’t it?).

But nobody guarantees that the internal storage will remain the same. It may have lasted for a couple of decades but a crucial design document that describes its relocation may already be pending an approval. You never know.

Always stick to API (whatever it is, native, Windows Forms, WPF, etc). Even if the underlying code reads the value from the location you know.

## Method 4

This is a pretty elegant WPF approach that I’ve found documented in [this blog post](http://blogs.msdn.com/b/jaimer/archive/2007/03/07/getting-system-dpi-in-wpf-app.aspx). It is based on the functionality provided by `System.Windows.Media.CompositionTarget` class that ultimately represents the display surface on which the WPF application is drawn. The class provides 2 useful methods:

*   `TransformFromDevice`
*   `TransformToDevice`

The names are self-explanatory and in both cases we get a `System.Windows.Media.Matrix` object that contains the mapping coefficients between device units (pixels) and independent units. M11 will contain a coefficient for the X axis and M22 – for the Y axis.

As we have been considering a units->pixels direction so far let’s re-write our helper with `CompositionTarget.TransformToDevice.` When calling this method M11 and M22 will contain values that we calculated as:

*   dpiX / 96
*   dpiY / 96

So on a machine with DPI set to 120 the coefficients will be 1.25.

Here’s the new helper:

```
/// <summary>
/// Transforms device independent units (1/96 of an inch)
/// to pixels
/// </summary>
/// <param name="visual">a visual object</param>
/// <param name="unitX">a device independent unit value X</param>
/// <param name="unitY">a device independent unit value Y</param>
/// <param name="pixelX">returns the X value in pixels</param>
/// <param name="pixelY">returns the Y value in pixels</param>
public void TransformToPixels(Visual visual,
                              double unitX,
                              double unitY,
                              out int pixelX,
                              out int pixelY)
{
    Matrix matrix;
    var source = PresentationSource.FromVisual(visual);
    if (source != null)
    {
        matrix = source.CompositionTarget.TransformToDevice;
    }
    else
    {
        using (var src = new HwndSource(new HwndSourceParameters()))
        {
            matrix = src.CompositionTarget.TransformToDevice;
        }
    }

    pixelX = (int)(matrix.M11 * unitX);
    pixelY = (int)(matrix.M22 * unitY);
}
```

I had to add one more parameter to the method, the `Visual`. We need it as a base for calculations (previous samples used the device context of the entire screen for that). I don’t think it’s a big issue as you are more than likely to have a `Visual` at hand when running your WPF application (otherwise, why would you need to translate pixel coordinates?). However, if your visual hasn't been attached to a presentation source (that is, it hasn't been shown yet) you can't get the presentation source (thus, we have a check for NULL and construct a new HwndSource).

## So what would you recommend, dude?

I’m in between options 2 (Win API through PInvoke) and 4 (`CompositionTarget`).

For a regular Windows desktop application there is no big difference but on the other hand it would be easier to move to other platforms (mobile, for example) when there are less platform specific dependencies. Option 4 seems to have the edge.

Update:

I did a quick performance test with `System.Diagnostics.Stopwatch` class and option 4 turned out to be 2 times faster than option 2 (~1000 ticks vs. ~2000 ticks respectively). The timer resolution was 2208037 ticks per second.