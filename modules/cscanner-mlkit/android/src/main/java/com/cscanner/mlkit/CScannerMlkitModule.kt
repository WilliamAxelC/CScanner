package com.cscanner.mlkit

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

class CScannerMlkitModule : Module() {
  companion object {
    private const val SCAN_REQUEST_CODE = 44281
  }

  private var pendingScanPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("CScannerMlkit")

    OnActivityResult { _, payload ->
      if (payload.requestCode != SCAN_REQUEST_CODE) return@OnActivityResult
      val promise = pendingScanPromise ?: return@OnActivityResult
      pendingScanPromise = null

      if (payload.resultCode != Activity.RESULT_OK) {
        promise.resolve(mapOf("cancelled" to true, "pages" to emptyList<Map<String, Any>>()))
        return@OnActivityResult
      }

      val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(payload.data)
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

      scanResult.pages?.forEach { page ->
        val destFile = File(outDir, "${UUID.randomUUID()}.jpg")
        context.contentResolver.openInputStream(page.imageUri)?.use { input ->
          FileOutputStream(destFile).use { output ->
            input.copyTo(output)
          }
        }
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(destFile.absolutePath, opts)
        pages.add(
          mapOf(
            "uri" to Uri.fromFile(destFile).toString(),
            "width" to opts.outWidth,
            "height" to opts.outHeight
          )
        )
      }

      promise.resolve(mapOf("cancelled" to false, "pages" to pages))
    }

    AsyncFunction("scanDocument") { options: Map<String, Any?>, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "Current activity is null", null)
        return@AsyncFunction
      }
      if (pendingScanPromise != null) {
        promise.reject("ERR_BUSY", "A scan is already in progress", null)
        return@AsyncFunction
      }

      val pageLimit = (options["pageLimit"] as? Number)?.toInt() ?: 24
      val galleryImportAllowed = options["galleryImportAllowed"] as? Boolean ?: true
      val scannerModeStr = options["scannerMode"] as? String ?: "FULL"

      val scannerMode = when (scannerModeStr.uppercase()) {
        "BASE" -> GmsDocumentScannerOptions.SCANNER_MODE_BASE
        "BASE_WITH_FILTER" -> GmsDocumentScannerOptions.SCANNER_MODE_BASE_WITH_FILTER
        else -> GmsDocumentScannerOptions.SCANNER_MODE_FULL
      }

      val scannerOptions = GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(galleryImportAllowed)
        .setPageLimit(pageLimit)
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .setScannerMode(scannerMode)
        .build()

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
          } catch (e: Exception) {
            pendingScanPromise = null
            promise.reject("ERR_LAUNCH_SCANNER", e.message ?: "Failed to launch ML Kit scanner", e)
          }
        }
        .addOnFailureListener { e ->
          pendingScanPromise = null
          promise.reject("ERR_SCANNER_UNAVAILABLE", e.message ?: "ML Kit scanner unavailable", e)
        }
    }

    AsyncFunction("recognizeText") { imageUri: String, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("ERR_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      try {
        val uri = parseUri(imageUri)
        val bitmap = decodeOrientedBitmap(context.contentResolver, uri)
          ?: throw IllegalArgumentException("Could not decode image at $imageUri")
        val width = max(1, bitmap.width).toFloat()
        val height = max(1, bitmap.height).toFloat()

        val image = InputImage.fromBitmap(bitmap, 0)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
          .addOnSuccessListener { visionText ->
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
            bitmap.recycle()
            promise.resolve(
              mapOf(
                "fullText" to visionText.text,
                "blocks" to blocks
              )
            )
          }
          .addOnFailureListener { e ->
            bitmap.recycle()
            promise.reject("ERR_OCR_FAILED", e.message ?: "Text recognition failed", e)
          }
      } catch (e: Exception) {
        promise.reject("ERR_OCR_LOAD", e.message ?: "Failed to prepare OCR image", e)
      }
    }

    AsyncFunction("processImage") { params: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")

      val inputUri = params["inputUri"] as? String
        ?: throw IllegalArgumentException("inputUri is required")
      val outputUri = params["outputUri"] as? String
        ?: throw IllegalArgumentException("outputUri is required")
      val rotation = (params["rotation"] as? Number)?.toInt() ?: 0
      val filter = (params["filter"] as? String) ?: "original"
      val brightness = (params["brightness"] as? Number)?.toFloat() ?: 0f
      val contrast = (params["contrast"] as? Number)?.toFloat() ?: 0f
      val quality = ((params["quality"] as? Number)?.toInt() ?: 88).coerceIn(30, 100)

      @Suppress("UNCHECKED_CAST")
      val quadList = params["quad"] as? List<Map<String, Any?>>

      var bitmap = decodeOrientedBitmap(context.contentResolver, parseUri(inputUri))
        ?: throw IllegalArgumentException("Unable to decode inputUri: $inputUri")

      if (quadList != null && quadList.size == 4) {
        bitmap = warpQuadBitmap(bitmap, quadList)
      }

      if (rotation % 360 != 0) {
        val m = Matrix().apply { postRotate((rotation % 360).toFloat()) }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
        if (rotated != bitmap) bitmap.recycle()
        bitmap = rotated
      }

      if (filter != "original" || brightness != 0f || contrast != 0f) {
        val filtered = applyPixelFilter(bitmap, filter, brightness, contrast)
        if (filtered != bitmap) bitmap.recycle()
        bitmap = filtered
      }

      val outFile = uriToFile(outputUri)
      outFile.parentFile?.mkdirs()
      FileOutputStream(outFile).use { fos ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, fos)
      }

      val w = bitmap.width
      val h = bitmap.height
      bitmap.recycle()

      mapOf(
        "uri" to Uri.fromFile(outFile).toString(),
        "width" to w,
        "height" to h
      )
    }

    AsyncFunction("composeIdCard") { params: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")

      val frontUri = params["frontUri"] as? String
        ?: throw IllegalArgumentException("frontUri is required")
      val backUri = params["backUri"] as? String
        ?: throw IllegalArgumentException("backUri is required")
      val outputUri = params["outputUri"] as? String
        ?: throw IllegalArgumentException("outputUri is required")

      val frontBmp = decodeOrientedBitmap(context.contentResolver, parseUri(frontUri))
        ?: throw IllegalArgumentException("Unable to decode frontUri")
      val backBmp = decodeOrientedBitmap(context.contentResolver, parseUri(backUri))
        ?: throw IllegalArgumentException("Unable to decode backUri")

      val pageW = 1240
      val pageH = 1754
      val canvasBmp = Bitmap.createBitmap(pageW, pageH, Bitmap.Config.ARGB_8888)
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

      frontBmp.recycle()
      backBmp.recycle()

      val outFile = uriToFile(outputUri)
      outFile.parentFile?.mkdirs()
      FileOutputStream(outFile).use { fos ->
        canvasBmp.compress(Bitmap.CompressFormat.JPEG, 92, fos)
      }
      canvasBmp.recycle()

      mapOf(
        "uri" to Uri.fromFile(outFile).toString(),
        "width" to pageW,
        "height" to pageH
      )
    }
  }

  private fun parseUri(uriStr: String): Uri {
    return if (uriStr.startsWith("/")) Uri.fromFile(File(uriStr)) else Uri.parse(uriStr)
  }

  private fun uriToFile(uriStr: String): File {
    val parsed = parseUri(uriStr)
    return File(parsed.path ?: uriStr)
  }

  private fun decodeOrientedBitmap(
    resolver: android.content.ContentResolver,
    uri: Uri
  ): Bitmap? {
    val raw = resolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream)
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

    if (angle == 0f) return raw
    val m = Matrix().apply { postRotate(angle) }
    val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
    if (rotated != raw) raw.recycle()
    return rotated
  }

  private fun warpQuadBitmap(src: Bitmap, quad: List<Map<String, Any?>>): Bitmap {
    val w = src.width.toFloat()
    val h = src.height.toFloat()
    fun pt(i: Int): Pair<Float, Float> {
      val m = quad[i]
      val x = ((m["x"] as? Number)?.toFloat() ?: 0f).coerceIn(0f, 1f) * w
      val y = ((m["y"] as? Number)?.toFloat() ?: 0f).coerceIn(0f, 1f) * h
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
    matrix.setPolyToPoly(srcPts, 0, dstPts, 0, 4)

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
    }

    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    out.setPixels(pixels, 0, w, 0, 0, w, h)
    return out
  }
}
