package com.cscanner.mlkit

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

class CScannerMlkitModule : Module() {
  companion object {
    private const val SCAN_REQUEST_CODE = 44281
    internal const val MAX_BITMAP_DIM = 4096
    internal const val MAX_FILTER_DIM = 2400
    internal const val MAX_SCAN_PAGE_LIMIT = 50
    internal const val MAX_SCAN_COPY_BYTES = 25L * 1024L * 1024L

    internal fun resolveScannerMode(scannerModeStr: String): Int {
      return when (scannerModeStr.uppercase()) {
        "BASE" -> GmsDocumentScannerOptions.SCANNER_MODE_BASE
        "BASE_WITH_FILTER" -> GmsDocumentScannerOptions.SCANNER_MODE_BASE_WITH_FILTER
        else -> GmsDocumentScannerOptions.SCANNER_MODE_FULL
      }
    }

    internal fun buildScannerOptions(
      pageLimit: Int,
      galleryImportAllowed: Boolean,
      scannerModeStr: String
    ): GmsDocumentScannerOptions {
      return GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(galleryImportAllowed)
        .setPageLimit(pageLimit.coerceIn(1, MAX_SCAN_PAGE_LIMIT))
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .setScannerMode(resolveScannerMode(scannerModeStr))
        .build()
    }

    internal fun safeClamp01(value: Double): Float {
      return if (!value.isFinite()) 0f else value.toFloat().coerceIn(0f, 1f)
    }

    internal fun calculateInSampleSize(
      width: Int,
      height: Int,
      maxDim: Int = MAX_BITMAP_DIM
    ): Int {
      if (width <= 0 || height <= 0 || maxDim <= 0) return 1
      var inSampleSize = 1
      var w = width
      var h = height
      while (w > maxDim || h > maxDim) {
        w /= 2
        h /= 2
        inSampleSize *= 2
      }
      return max(1, inSampleSize)
    }

    private fun isInsideAllowedRoots(file: File, allowedRoots: List<File>): Boolean {
      val canonical = try {
        file.canonicalFile
      } catch (_: Exception) {
        return false
      }
      val canonicalPath = canonical.path
      for (root in allowedRoots) {
        val rootCanonical = try {
          root.canonicalFile
        } catch (_: Exception) {
          continue
        }
        val rootPath = rootCanonical.path
        if (canonicalPath.startsWith("$rootPath${File.separator}")) {
          val rel = canonicalPath.substring(rootPath.length + 1)
          val firstSegment = rel.substringBefore(File.separatorChar)
          if (firstSegment == "databases" || firstSegment == "shared_prefs") {
            return false
          }
          return true
        }
      }
      return false
    }

    private fun parseLocalOrContentUri(uriStr: String): Pair<String?, String?> {
      val trimmed = uriStr.trim()
      if (trimmed.isEmpty()) return Pair(null, null)
      if (trimmed.startsWith("/")) return Pair(null, trimmed)
      val colonIdx = trimmed.indexOf(':')
      if (colonIdx <= 0) return Pair(null, null)
      val scheme = trimmed.substring(0, colonIdx).lowercase()
      if (!scheme.all { it.isLetterOrDigit() || it == '+' || it == '-' || it == '.' }) {
        return Pair(null, null)
      }
      if (scheme == "content") {
        val afterScheme = trimmed.substring(colonIdx + 1)
        return Pair("content", afterScheme.takeIf { it.startsWith("//") && it.length > 2 })
      }
      if (scheme == "file") {
        try {
          val parsed = java.net.URI(trimmed)
          val host = parsed.host
          if (host != null && host.isNotEmpty() && !host.equals("localhost", ignoreCase = true)) {
            return Pair("file", null)
          }
          if (!parsed.path.isNullOrBlank()) {
            return Pair("file", parsed.path)
          }
        } catch (_: Exception) {
          // fall through to raw unescaped file:// path handling
        }
        val afterColon = trimmed.substring(colonIdx + 1).substringBefore('?').substringBefore('#')
        val fallbackPath = when {
          afterColon.startsWith("///") -> afterColon.substring(2)
          afterColon.startsWith("//localhost/") -> afterColon.substring(11)
          afterColon.startsWith("//") -> null
          afterColon.startsWith("/") -> afterColon
          else -> null
        }
        return Pair("file", fallbackPath)
      }
      return Pair(scheme, trimmed.substring(colonIdx + 1))
    }

    internal fun resolveSafeOutputFile(uriStr: String, allowedRoots: List<File>): File {
      val (scheme, rawPath) = parseLocalOrContentUri(uriStr)
      if (rawPath.isNullOrBlank() || (scheme != null && scheme != "file")) {
        throw SecurityException("Output URI must use a file:// path within app storage")
      }

      val target = File(rawPath)
      if (!isInsideAllowedRoots(target, allowedRoots)) {
        throw SecurityException("Output path is outside allowed app storage roots")
      }
      return target.canonicalFile
    }

    internal fun isAllowedInputUri(uriStr: String, allowedRoots: List<File>): Boolean {
      val (scheme, path) = parseLocalOrContentUri(uriStr)
      return when (scheme) {
        null -> !path.isNullOrBlank() && isInsideAllowedRoots(File(path), allowedRoots)
        "content" -> !path.isNullOrBlank()
        "file" -> !path.isNullOrBlank() && isInsideAllowedRoots(File(path), allowedRoots)
        else -> false
      }
    }

    internal fun resolveSafeUpdateApkFile(uriStr: String, cacheDir: File): File {
      val (scheme, rawPath) = parseLocalOrContentUri(uriStr)
      if (rawPath.isNullOrBlank() || (scheme != null && scheme != "file")) {
        throw IllegalArgumentException("APK URI must use a file:// path")
      }
      val updatesRoot = File(cacheDir, "updates").canonicalFile
      val target = File(rawPath).canonicalFile
      val rootPrefix = "${updatesRoot.path}${File.separator}"
      if (!target.path.startsWith(rootPrefix) || !target.name.endsWith(".apk", ignoreCase = true) || !target.isFile) {
        throw IllegalArgumentException("APK must reside inside CScanner updates cache")
      }
      return target
    }

    internal fun computeSha256Hex(file: File): String {
      val digest = MessageDigest.getInstance("SHA-256")
      file.inputStream().use { input ->
        val buffer = ByteArray(1 shl 16)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          digest.update(buffer, 0, read)
        }
      }
      return digest.digest().joinToString("") { "%02x".format(it) }
    }
  }

  private var pendingScanPromise: Promise? = null

  private fun getAllowedRoots(context: android.content.Context): List<File> {
    return listOfNotNull(context.filesDir, context.cacheDir)
  }

  override fun definition() = ModuleDefinition {
    Name("CScannerMlkit")

    OnActivityResult { _, payload ->
      if (payload.requestCode != SCAN_REQUEST_CODE) return@OnActivityResult
      val promise = pendingScanPromise ?: return@OnActivityResult
      pendingScanPromise = null

      try {
        val data = payload.data
        if (payload.resultCode != Activity.RESULT_OK || data == null) {
          promise.resolve(mapOf("cancelled" to true, "pages" to emptyList<Map<String, Any>>()))
          return@OnActivityResult
        }

        val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(data)
        if (scanResult == null) {
          promise.resolve(mapOf("cancelled" to true, "pages" to emptyList<Map<String, Any>>()))
          return@OnActivityResult
        }

        val context = appContext.reactContext ?: run {
          promise.reject("ERR_CONTEXT", "React context unavailable", null)
          return@OnActivityResult
        }

        val outDir = File(context.cacheDir, "mlkit-scans").apply { mkdirs() }
        val pages = mutableListOf<Map<String, Any>>()

        scanResult.pages?.take(MAX_SCAN_PAGE_LIMIT)?.forEach { page ->
          val destFile = File(outDir, "${UUID.randomUUID()}.jpg")
          val copied = context.contentResolver.openInputStream(page.imageUri)?.use { input ->
            FileOutputStream(destFile).use { output ->
              copyBounded(input, output, MAX_SCAN_COPY_BYTES)
            }
            true
          } ?: false

          if (!copied || !destFile.exists()) {
            destFile.delete()
            return@forEach
          }

          val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          BitmapFactory.decodeFile(destFile.absolutePath, opts)
          if (opts.outWidth <= 0 || opts.outHeight <= 0) {
            destFile.delete()
            return@forEach
          }

          pages.add(
            mapOf(
              "uri" to Uri.fromFile(destFile).toString(),
              "width" to opts.outWidth,
              "height" to opts.outHeight
            )
          )
        }

        promise.resolve(mapOf("cancelled" to false, "pages" to pages))
      } catch (t: Throwable) {
        promise.reject("ERR_SCAN_RESULT", "Failed processing scanned pages", null)
      }
    }

    AsyncFunction("scanDocument") { pageLimit: Int, galleryImportAllowed: Boolean, scannerModeStr: String, promise: Promise ->
      try {
        val activity = appContext.currentActivity
        if (activity == null || activity.isFinishing || activity.isDestroyed) {
          promise.reject("ERR_NO_ACTIVITY", "Current activity is unavailable", null)
          return@AsyncFunction
        }
        if (pendingScanPromise != null) {
          promise.reject("ERR_BUSY", "A scan is already in progress", null)
          return@AsyncFunction
        }

        val scannerOptions = buildScannerOptions(pageLimit, galleryImportAllowed, scannerModeStr)
        val scanner = GmsDocumentScanning.getClient(scannerOptions)
        pendingScanPromise = promise

        scanner.getStartScanIntent(activity)
          .addOnSuccessListener { intentSender ->
            try {
              activity.startIntentSenderForResult(
                intentSender,
                SCAN_REQUEST_CODE,
                null,
                0,
                0,
                0
              )
            } catch (_: Throwable) {
              pendingScanPromise = null
              promise.reject("ERR_LAUNCH_SCANNER", "Failed to launch ML Kit scanner", null)
            }
          }
          .addOnFailureListener { _ ->
            pendingScanPromise = null
            promise.reject("ERR_SCANNER_UNAVAILABLE", "ML Kit document scanner is unavailable on this device", null)
          }
      } catch (_: Throwable) {
        pendingScanPromise = null
        promise.reject("ERR_SCAN_EXCEPTION", "Unable to start document scanner", null)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("recognizeText") { imageUri: String, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("ERR_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      var bitmap: Bitmap? = null
      try {
        val allowedRoots = getAllowedRoots(context)
        if (!isAllowedInputUri(imageUri, allowedRoots)) {
          promise.reject("ERR_INVALID_URI", "Image URI is not inside permitted app storage", null)
          return@AsyncFunction
        }
        val uri = parseUri(imageUri)
        bitmap = decodeOrientedBitmap(context.contentResolver, uri)
          ?: throw IllegalArgumentException("Could not decode image")
        val width = max(1, bitmap.width).toFloat()
        val height = max(1, bitmap.height).toFloat()

        val image = InputImage.fromBitmap(bitmap, 0)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
          .addOnSuccessListener { visionText ->
            try {
              val blocks = mutableListOf<Map<String, Any>>()
              for (block in visionText.textBlocks) {
                for (line in block.lines) {
                  val box = line.boundingBox ?: continue
                  blocks.add(
                    mapOf(
                      "text" to line.text,
                      "x" to (box.left.toFloat() / width).coerceIn(0f, 1f),
                      "y" to (box.top.toFloat() / height).coerceIn(0f, 1f),
                      "width" to (box.width().toFloat() / width).coerceIn(0f, 1f),
                      "height" to (box.height().toFloat() / height).coerceIn(0f, 1f)
                    )
                  )
                }
              }
              promise.resolve(
                mapOf(
                  "fullText" to visionText.text,
                  "blocks" to blocks
                )
              )
            } finally {
              bitmap?.recycle()
            }
          }
          .addOnFailureListener { _ ->
            bitmap?.recycle()
            promise.reject("ERR_OCR_FAILED", "On-device text recognition failed", null)
          }
      } catch (_: Throwable) {
        bitmap?.recycle()
        promise.reject("ERR_OCR_LOAD", "Failed to prepare image for OCR", null)
      }
    }

    AsyncFunction("processImage") {
      inputUri: String,
      outputUri: String,
      quadCoords: List<Double>?,
      rotation: Int,
      filter: String,
      brightnessDouble: Double,
      contrastDouble: Double,
      qualityRaw: Int ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")
      val allowedRoots = getAllowedRoots(context)
      if (!isAllowedInputUri(inputUri, allowedRoots)) {
        throw SecurityException("Input URI is outside permitted app storage")
      }
      val outFile = resolveSafeOutputFile(outputUri, allowedRoots)

      val brightness = if (brightnessDouble.isFinite()) brightnessDouble.toFloat().coerceIn(-100f, 100f) else 0f
      val contrast = if (contrastDouble.isFinite()) contrastDouble.toFloat().coerceIn(-100f, 100f) else 0f
      val quality = qualityRaw.coerceIn(30, 100)

      var bitmap = decodeOrientedBitmap(context.contentResolver, parseUri(inputUri))
        ?: throw IllegalArgumentException("Unable to decode input image")

      try {
        if (quadCoords != null && quadCoords.size == 8) {
          bitmap = warpQuadBitmap(bitmap, quadCoords)
        }

        if (rotation % 360 != 0) {
          val m = Matrix().apply { postRotate((rotation % 360).toFloat()) }
          val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
          if (rotated != bitmap) bitmap.recycle()
          bitmap = rotated
        }

        // Bound dimensions before per-pixel IntArray filter allocation to prevent OOM
        bitmap = downscaleIfNeeded(bitmap, MAX_FILTER_DIM)

        if (filter != "original" || brightness != 0f || contrast != 0f) {
          val filtered = applyPixelFilter(bitmap, filter, brightness, contrast)
          if (filtered != bitmap) bitmap.recycle()
          bitmap = filtered
        }

        outFile.parentFile?.mkdirs()
        FileOutputStream(outFile).use { fos ->
          if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, fos)) {
            throw IllegalStateException("Failed compressing processed JPEG")
          }
        }

        val w = bitmap.width
        val h = bitmap.height
        mapOf(
          "uri" to Uri.fromFile(outFile).toString(),
          "width" to w,
          "height" to h
        )
      } finally {
        if (!bitmap.isRecycled) {
          bitmap.recycle()
        }
      }
    }

    AsyncFunction("redactImage") {
      inputUri: String,
      outputUri: String,
      redactRects: List<Double>,
      redactColors: List<String>,
      maxDimRaw: Int,
      qualityRaw: Int ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")
      val allowedRoots = getAllowedRoots(context)
      if (!isAllowedInputUri(inputUri, allowedRoots)) {
        throw SecurityException("Input URI is outside permitted app storage")
      }
      val outFile = resolveSafeOutputFile(outputUri, allowedRoots)
      val maxDim = maxDimRaw.coerceIn(64, MAX_BITMAP_DIM)
      val quality = qualityRaw.coerceIn(30, 100)

      var bitmap = decodeOrientedBitmap(context.contentResolver, parseUri(inputUri))
        ?: throw IllegalArgumentException("Unable to decode input image")

      try {
        bitmap = downscaleIfNeeded(bitmap, maxDim)
        val mutable = if (bitmap.isMutable) bitmap else {
          val copy = bitmap.copy(Bitmap.Config.ARGB_8888, true)
          bitmap.recycle()
          copy
        }
        bitmap = mutable

        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
        val w = bitmap.width.toFloat()
        val h = bitmap.height.toFloat()

        val rectCount = min(redactRects.size / 4, 200)
        for (i in 0 until rectCount) {
          val rx = safeClamp01(redactRects[i * 4]) * w
          val ry = safeClamp01(redactRects[i * 4 + 1]) * h
          val rw = safeClamp01(redactRects[i * 4 + 2]) * w
          val rh = safeClamp01(redactRects[i * 4 + 3]) * h
          val colorStr = redactColors.getOrNull(i) ?: "#000000"
          paint.color = if (colorStr.equals("#FFFFFF", ignoreCase = true)) Color.WHITE else Color.BLACK
          canvas.drawRect(rx, ry, rx + rw, ry + rh, paint)
        }

        outFile.parentFile?.mkdirs()
        FileOutputStream(outFile).use { fos ->
          if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, fos)) {
            throw IllegalStateException("Failed writing redacted JPEG")
          }
        }

        mapOf(
          "uri" to Uri.fromFile(outFile).toString(),
          "width" to bitmap.width,
          "height" to bitmap.height
        )
      } finally {
        if (!bitmap.isRecycled) {
          bitmap.recycle()
        }
      }
    }

    AsyncFunction("composeIdCard") { frontUri: String, backUri: String, outputUri: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")
      val allowedRoots = getAllowedRoots(context)
      if (!isAllowedInputUri(frontUri, allowedRoots) || !isAllowedInputUri(backUri, allowedRoots)) {
        throw SecurityException("ID card input URI is outside permitted app storage")
      }
      val outFile = resolveSafeOutputFile(outputUri, allowedRoots)

      var frontBmp: Bitmap? = null
      var backBmp: Bitmap? = null
      var canvasBmp: Bitmap? = null
      try {
        frontBmp = decodeOrientedBitmap(context.contentResolver, parseUri(frontUri))
          ?: throw IllegalArgumentException("Unable to decode front ID card image")
        backBmp = decodeOrientedBitmap(context.contentResolver, parseUri(backUri))
          ?: throw IllegalArgumentException("Unable to decode back ID card image")

        val pageW = 1240
        val pageH = 1754
        canvasBmp = Bitmap.createBitmap(pageW, pageH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(canvasBmp)
        canvas.drawColor(Color.WHITE)

        val borderPaint = Paint().apply {
          color = Color.rgb(203, 213, 225)
          style = Paint.Style.STROKE
          strokeWidth = 3f
        }
        val imgPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

        val marginX = 110f
        val maxSlotW = pageW - marginX * 2f
        val maxSlotH = 660f

        fun drawCard(bmp: Bitmap, centerY: Float) {
          val scale = min(maxSlotW / bmp.width.toFloat(), maxSlotH / bmp.height.toFloat())
          val dw = bmp.width * scale
          val dh = bmp.height * scale
          val left = (pageW - dw) / 2f
          val top = centerY - dh / 2f
          val rect = RectF(left, top, left + dw, top + dh)
          canvas.drawBitmap(bmp, null, rect, imgPaint)
          canvas.drawRect(rect, borderPaint)
        }

        drawCard(frontBmp, pageH * 0.28f)
        drawCard(backBmp, pageH * 0.72f)

        outFile.parentFile?.mkdirs()
        FileOutputStream(outFile).use { fos ->
          if (!canvasBmp.compress(Bitmap.CompressFormat.JPEG, 92, fos)) {
            throw IllegalStateException("Failed compressing ID sheet JPEG")
          }
        }

        mapOf(
          "uri" to Uri.fromFile(outFile).toString(),
          "width" to pageW,
          "height" to pageH
        )
      } finally {
        frontBmp?.recycle()
        backBmp?.recycle()
        canvasBmp?.recycle()
      }
    }

    AsyncFunction("sha256File") { uriStr: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val file = resolveSafeUpdateApkFile(uriStr, context.cacheDir)
      computeSha256Hex(file)
    }.runOnQueue(Queues.DEFAULT)

    Function("canInstallPackages") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.packageManager.canRequestPackageInstalls()
      } else {
        true
      }
    }

    Function("openInstallPermissionSettings") {
      val context = appContext.reactContext ?: return@Function false
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${context.packageName}")
        )
      } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }

    Function("inspectApk") { uriStr: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val file = resolveSafeUpdateApkFile(uriStr, context.cacheDir)
      @Suppress("DEPRECATION")
      val info = context.packageManager.getPackageArchiveInfo(file.absolutePath, 0)
        ?: return@Function null
      val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.longVersionCode
      } else {
        @Suppress("DEPRECATION")
        info.versionCode.toLong()
      }
      mapOf(
        "packageName" to info.packageName,
        "versionCode" to code.toDouble(),
        "versionName" to (info.versionName ?: "")
      )
    }

    Function("installApk") { uriStr: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val file = resolveSafeUpdateApkFile(uriStr, context.cacheDir)
      val contentUri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.FileSystemFileProvider",
        file
      )
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(contentUri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }
  }

  private fun parseUri(uriStr: String): Uri {
    return if (uriStr.startsWith("/")) Uri.fromFile(File(uriStr)) else Uri.parse(uriStr)
  }

  private fun copyBounded(input: InputStream, output: FileOutputStream, maxBytes: Long) {
    val buffer = ByteArray(16 * 1024)
    var total = 0L
    while (true) {
      val n = input.read(buffer)
      if (n <= 0) break
      total += n
      if (total > maxBytes) {
        throw SecurityException("Scanned image exceeds maximum allowed size")
      }
      output.write(buffer, 0, n)
    }
  }

  private fun downscaleIfNeeded(src: Bitmap, maxDim: Int): Bitmap {
    val largest = max(src.width, src.height)
    if (largest <= maxDim || largest <= 0) return src
    val scale = maxDim.toFloat() / largest.toFloat()
    val w = max(1, (src.width * scale).roundToInt())
    val h = max(1, (src.height * scale).roundToInt())
    val scaled = Bitmap.createScaledBitmap(src, w, h, true)
    if (scaled != src) src.recycle()
    return scaled
  }

  private fun decodeOrientedBitmap(
    resolver: android.content.ContentResolver,
    uri: Uri
  ): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream, null, bounds)
    } ?: return null

    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      return null
    }

    val decodeOpts = BitmapFactory.Options().apply {
      inSampleSize = calculateInSampleSize(bounds.outWidth, bounds.outHeight, MAX_BITMAP_DIM)
    }
    val raw = resolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream, null, decodeOpts)
    } ?: return null

    val orientation = try {
      resolver.openInputStream(uri)?.use { stream ->
        ExifInterface(stream).getAttributeInt(
          ExifInterface.TAG_ORIENTATION,
          ExifInterface.ORIENTATION_NORMAL
        )
      } ?: ExifInterface.ORIENTATION_NORMAL
    } catch (_: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }

    val angle = when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90f
      ExifInterface.ORIENTATION_ROTATE_180 -> 180f
      ExifInterface.ORIENTATION_ROTATE_270 -> 270f
      else -> 0f
    }

    if (angle == 0f) return downscaleIfNeeded(raw, MAX_BITMAP_DIM)
    val m = Matrix().apply { postRotate(angle) }
    val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
    if (rotated != raw) raw.recycle()
    return downscaleIfNeeded(rotated, MAX_BITMAP_DIM)
  }

  private fun warpQuadBitmap(src: Bitmap, quadCoords: List<Double>): Bitmap {
    val w = src.width.toFloat()
    val h = src.height.toFloat()
    fun pt(i: Int): Pair<Float, Float> {
      val x = safeClamp01(quadCoords[i * 2]) * w
      val y = safeClamp01(quadCoords[i * 2 + 1]) * h
      return x to y
    }

    val (tlx, tly) = pt(0)
    val (trx, try_) = pt(1)
    val (brx, bry) = pt(2)
    val (blx, bly) = pt(3)

    val topW = kotlin.math.hypot((trx - tlx).toDouble(), (try_ - tly).toDouble())
    val botW = kotlin.math.hypot((brx - blx).toDouble(), (bry - bly).toDouble())
    val leftH = kotlin.math.hypot((blx - tlx).toDouble(), (bly - tly).toDouble())
    val rightH = kotlin.math.hypot((brx - trx).toDouble(), (bry - try_).toDouble())

    var dstW = max(64, max(topW, botW).roundToInt())
    var dstH = max(64, max(leftH, rightH).roundToInt())
    val maxDim = 2200
    val largest = max(dstW, dstH)
    if (largest > maxDim) {
      val s = maxDim.toFloat() / largest.toFloat()
      dstW = max(64, (dstW * s).roundToInt())
      dstH = max(64, (dstH * s).roundToInt())
    }

    val srcPts = floatArrayOf(tlx, tly, trx, try_, brx, bry, blx, bly)
    val dstPts = floatArrayOf(
      0f, 0f,
      dstW.toFloat(), 0f,
      dstW.toFloat(), dstH.toFloat(),
      0f, dstH.toFloat()
    )

    val matrix = Matrix()
    if (!matrix.setPolyToPoly(srcPts, 0, dstPts, 0, 4)) {
      return src
    }

    val out = Bitmap.createBitmap(dstW, dstH, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawColor(Color.WHITE)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    canvas.drawBitmap(src, matrix, paint)
    src.recycle()
    return out
  }

  private fun applyPixelFilter(
    src: Bitmap,
    filter: String,
    brightness: Float,
    contrast: Float
  ): Bitmap {
    val w = src.width
    val h = src.height
    val count = w * h
    if (count <= 0) return src
    val pixels = IntArray(count)
    src.getPixels(pixels, 0, w, 0, 0, w, h)

    val contrastFactor = if (contrast >= 0f) {
      1f + (contrast / 100f) * 1.5f
    } else {
      max(0.15f, 1f + contrast / 120f)
    }

    fun adjust(v: Float, b: Float, cf: Float): Int {
      val shifted = v + b * 1.25f
      return ((shifted - 128f) * cf + 128f).roundToInt().coerceIn(0, 255)
    }

    when (filter) {
      "original" -> {
        for (i in 0 until count) {
          val c = pixels[i]
          val r = adjust(((c shr 16) and 0xFF).toFloat(), brightness, contrastFactor)
          val g = adjust(((c shr 8) and 0xFF).toFloat(), brightness, contrastFactor)
          val b = adjust((c and 0xFF).toFloat(), brightness, contrastFactor)
          pixels[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
      }
      "grayscale" -> {
        for (i in 0 until count) {
          val c = pixels[i]
          val l = 0.2126f * ((c shr 16) and 0xFF) +
            0.7152f * ((c shr 8) and 0xFF) +
            0.0722f * (c and 0xFF)
          val v = adjust(l, brightness, contrastFactor)
          pixels[i] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
        }
      }
      "lighten" -> {
        for (i in 0 until count) {
          val c = pixels[i]
          val r = 255f * (((c shr 16) and 0xFF) / 255f).toDouble().pow(0.68).toFloat()
          val g = 255f * (((c shr 8) and 0xFF) / 255f).toDouble().pow(0.68).toFloat()
          val b = 255f * ((c and 0xFF) / 255f).toDouble().pow(0.68).toFloat()
          val rr = adjust(r, brightness + 10f, contrastFactor)
          val gg = adjust(g, brightness + 10f, contrastFactor)
          val bb = adjust(b, brightness + 10f, contrastFactor)
          pixels[i] = (0xFF shl 24) or (rr shl 16) or (gg shl 8) or bb
        }
      }
      "bw", "magic" -> {
        val gray = IntArray(count)
        for (i in 0 until count) {
          val c = pixels[i]
          gray[i] = (0.299f * ((c shr 16) and 0xFF) +
            0.587f * ((c shr 8) and 0xFF) +
            0.114f * (c and 0xFF)).roundToInt()
        }
        val w1 = w + 1
        val sat = LongArray((w + 1) * (h + 1))
        for (y in 1..h) {
          var rowSum = 0L
          val srcOff = (y - 1) * w
          val dstOff = y * w1
          val prevOff = (y - 1) * w1
          for (x in 1..w) {
            rowSum += gray[srcOff + x - 1]
            sat[dstOff + x] = sat[prevOff + x] + rowSum
          }
        }
        val radius = max(8, min(w, h) / 22)

        if (filter == "bw") {
          val bias = 11f - brightness * 0.2f
          for (y in 0 until h) {
            val y0 = max(0, y - radius)
            val y1 = min(h - 1, y + radius)
            for (x in 0 until w) {
              val x0 = max(0, x - radius)
              val x1 = min(w - 1, x + radius)
              val sum = sat[(y1 + 1) * w1 + (x1 + 1)] -
                sat[y0 * w1 + (x1 + 1)] -
                sat[(y1 + 1) * w1 + x0] +
                sat[y0 * w1 + x0]
              val area = (x1 - x0 + 1) * (y1 - y0 + 1)
              val mean = sum.toFloat() / area.toFloat()
              val v = if (gray[y * w + x] < mean - bias) 0 else 255
              pixels[y * w + x] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
            }
          }
        } else {
          val magicCf = contrastFactor * 1.18f
          for (y in 0 until h) {
            val y0 = max(0, y - radius)
            val y1 = min(h - 1, y + radius)
            for (x in 0 until w) {
              val x0 = max(0, x - radius)
              val x1 = min(w - 1, x + radius)
              val sum = sat[(y1 + 1) * w1 + (x1 + 1)] -
                sat[y0 * w1 + (x1 + 1)] -
                sat[(y1 + 1) * w1 + x0] +
                sat[y0 * w1 + x0]
              val area = (x1 - x0 + 1) * (y1 - y0 + 1)
              val localBg = sum.toFloat() / area.toFloat()
              val normScale = if (localBg > 32f) min(2.0f, 235f / localBg) else 1f
              val factor = 0.45f + 0.55f * min(1.4f, normScale)

              val c = pixels[y * w + x]
              val r0 = ((c shr 16) and 0xFF) * factor
              val g0 = ((c shr 8) and 0xFF) * factor
              val b0 = (c and 0xFF) * factor
              val l = 0.299f * r0 + 0.587f * g0 + 0.114f * b0
              val r = adjust(l + (r0 - l) * 1.18f, brightness, magicCf)
              val g = adjust(l + (g0 - l) * 1.18f, brightness, magicCf)
              val b = adjust(l + (b0 - l) * 1.18f, brightness, magicCf)
              pixels[y * w + x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
          }
        }
      }
      else -> return src
    }

    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    out.setPixels(pixels, 0, w, 0, 0, w, h)
    return out
  }
}
