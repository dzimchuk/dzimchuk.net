---
title: Efficient way to position windows in WPF
date: 2012-02-13T09:22:00.000Z
lastmod: 2015-04-23T16:44:38.000Z
permalink: efficient-way-to-position-windows-in-wpf
uuid: 49bf0652-8e86-4fb9-ac02-12fc806924af
tags: WPF
---

Imagine you have created a custom template for your window and disabled standard chrome. If you want to maximize your window you can’t just set its WindowState to Maximized because it will move over the taskbar. Instead, you will have to position it so its top left corner is at 0,0 and its bottom right corner is at SystemParameters.WorkArea’s Height and Width respectively. When you want to restore your window back to its normal state you will reset the coordinates and sizes according to Window.RestoreBounds.

The problem is that in WPF you can’t define your window’s position and size in one call. You will have to set its Left, Top, Width and Height properties separately which results in a rather unattractive effect when you can actually see each step as it happens. The more the difference in size is (maximize/restore or full screen/restore scenarios) and the heavier your UI is the more ugly it gets to look.

A viable solution would be to revert to native Win32 API. For example, [MoveWindow](http://msdn.microsoft.com/en-us/library/windows/desktop/ms633534(v=vs.85).aspx) function does exactly what we want. The only thing to remember is to translate device independent units into pixels. I had posted a few ways to accomplish that [a while ago.](Best-way-to-get-DPI-value-in-WPF) As a result we can come up with a handy helper method like this:

```
public static void MoveWindow(this Window window,
                              double left,
                              double top,
                              double width,
                              double height)
{
    int pxLeft = 0, pxTop = 0;
    if (left != 0 || top != 0)
        window.TransformToPixels(left, top, 
            out pxLeft, out pxTop);

    int pxWidth, pxHeight;
    window.TransformToPixels(width, height, 
        out pxWidth, out pxHeight);

    var helper = new WindowInteropHelper(window);
    WindowsManagement.MoveWindow(helper.Handle, 
        pxLeft, pxTop, pxWidth, pxHeight, true);
}

public static void TransformToPixels(this Visual visual,
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

[DllImport("user32.dll", CharSet = CharSet.Unicode)]
public static extern int MoveWindow(IntPtr hWnd, int X, int Y, 
            int nWidth, int nHeight, 
            [MarshalAs(UnmanagedType.Bool)] bool bRepaint);
```

It works really well, however you might also want to explore the possibilities with visual states. However, there is a limitation on what you can use to set values of the animations, see [Storyboards Overview](http://msdn.microsoft.com/en-us/library/ms742868.aspx):

> You can't use dynamic resource references or data binding expressions to set Storyboard or animation property values. That's because everything inside a ControlTemplate must be thread-safe, and the timing system must Freeze Storyboard objects to make them thread-safe. A Storyboard cannot be frozen if it or its child timelines contain dynamic resource references or data binding expressions. For more information about freezing and other Freezable features, see the Freezable Objects Overview.

Why would you want to bind window's location and size properties instead of taking the values directly from SystemParameters.WorkArea and SystemParameters.RestoreBounds? That's because there are more complicated scenarious than just Normal->Maximized or Maximized->Normal states. Consider, for example, Normal->Maximized->FullScreen->Maximized->Normal and Normal->FullScreen->Normal. These are two different cases and we need to know the restore bounds when we return from the full screen state. So we can't just access RestoreBounds, instead we want to define our own properties and bind to them.

With the first proposed approach your hands are untied, however we introduce a dependency on Win32 API.