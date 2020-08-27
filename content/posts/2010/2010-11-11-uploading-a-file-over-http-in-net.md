---
title: Uploading a file over HTTP in .NET
date: 2010-11-11T06:56:00.000Z
lastmod: 2015-04-23T17:10:03.000Z
permalink: uploading-a-file-over-http-in-net
uuid: e35697e1-f193-4cfc-9b6e-fed9b6eeb7bf
tags: .NET
---

You program a client that needs to upload a file to the server. What are the options? You should probably look into `System.Net` namespace where you can either program at `WebRequest/WebResponse` level or make use of one of the convenient methods on the `WebClient` class.

The 1st approach is described [here](http://msdn.microsoft.com/en-us/library/debx8sh9.aspx) and `WebClient` provides a bunch methods with self-explaining names: `UploadData, UploadFile, UploadString` and `UploadValues`. There are also asynchronous versions of the methods as well as overloads to send data over FTP.

However, .NET doesn’t provide an out-of-the-box solution when you need to upload a file together with accompanying metadata. The metadata can be anything and is usually presented as name/value pairs, that is exactly what `WebClient.UploadValues` is supposed to do. And it does, but it doesn’t allow to send some binary array (a file) along with metadata.

`UploadValues` can send a string-string dictionary of values. We can theoretically Base64-encode the file but that’s probably not what the other side expects. Content type is set to `application/x-www-form-urlencoded`. What’s that mean? This code:

```
NameValueCollection data = new NameValueCollection();
data.Add("id", "10");
data.Add("param", "content");
data.Add("file", "A0BA");
WebClient client = new WebClient();
client.UploadValues("http://dzimchuk-mbl:14393/", null, data);
```

is going to produce the following request:

[![WebClient's UploadValues method's request](https://blogcontent.azureedge.net/upload_values_thumb.png "WebClient's UploadValues method's request")](https://blogcontent.azureedge.net/upload_values.png) 

Not really what we’re looking for. We want to send our stuff as `multipart/form-data` so that we could send dictionary values as well as binary content of a file in one request as just separate parts.

It’s interesting to note that `WebClient.UploadFile` does set content type to `multipart/form-data` **BUT**:

*   it doesn'r properly format the request and
*   there is no way to piggyback any additional metadata:

Let’s try to send a text file called “hello.txt” containing a single string “hello”:

```
WebClient client = new WebClient();
client.UploadFile("http://dzimchuk-mbl:14393/", 
    null, @"d:\hello.txt");
```

and here’s the request:

[![WebClient's UploadFile method's request](https://blogcontent.azureedge.net/upload_file_thumb.png "WebClient's UploadFile method's request")](https://blogcontent.azureedge.net/upload_file.png)

Yep, the request is not properly formatted. You’re going to get away with it with IIS and .NET stack but it’s likely to fail on other servers like Tomcat, for example.

## Solution

The solution to both of these problems is found [in this article](http://www.c-sharpcorner.com/UploadFile/gregoryprentice/DotNetBugs12062005230632PM/DotNetBugs.aspx) and there is a handy file uploader class  written by Gregory Prentice.

He explains why `WebClient` incorrectly constructs the request:

> There are basically three boundaries that need to be define: Begining or definition, Content, and Ending.  The Begining boundary basically consists of a bytes array that defines to the receiving end what values to expect as a separator of the multipart data.  The Content boundary consists of the "--" string appended to the begining of the boundary and is used to separate the actual multipart data during the upload.  The Ending boundary consists of the "--" appended to the end of the Content boundary.  As an example the following represents each of these as present in the source code:
> 
>   
> BeginBoundary = "ou812--------------8c405ee4e38917c";  
> ContentBoundary = "--" + BeginBoundary;  
> EndingBoundary = ContentBoundary + "--";

Using the proposed uploader class called `MultipartForm` is as easy as:

```
MultipartForm form = 
    new MultipartForm("http://dzimchuk-mbl:14393/");
form.SetField("id", "10");
form.SetField("param", "content");
form.SendFile(@"d:\hello.txt");
```

See we upload a text file together with additional dictionary of parameters. And here’s the request:

[![Uploading with MultipartForm](https://blogcontent.azureedge.net/upload_correct_thumb.png "Uploading with MultipartForm")](https://blogcontent.azureedge.net/upload_correct.png)

By default it sets the content type of the uploaded file to `text/xml` but if you need to upload a binary file you can specify ‘binary’ for the `FileContentType` property.

You can find a slightly brushed up version of `MultipartForm` class below.

[MultipartForm.zip (3.35 kb)](https://blogcontent.azureedge.net/2010%2f11%2fMultipartForm.zip)