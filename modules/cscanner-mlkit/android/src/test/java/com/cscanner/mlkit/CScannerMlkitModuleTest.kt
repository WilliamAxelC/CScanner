package com.cscanner.mlkit

import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class CScannerMlkitModuleTest {
  @Test
  fun buildScannerOptions_handlesAllModesAndClampsPageLimit() {
    val full = CScannerMlkitModule.buildScannerOptions(24, true, "FULL")
    assertNotNull(full)

    val base = CScannerMlkitModule.buildScannerOptions(0, false, "base")
    assertNotNull(base)

    val capped = CScannerMlkitModule.buildScannerOptions(999, true, "FULL")
    assertNotNull(capped)

    val baseFilter = CScannerMlkitModule.buildScannerOptions(5, true, "BASE_WITH_FILTER")
    assertNotNull(baseFilter)
    assertEquals(
      GmsDocumentScannerOptions.SCANNER_MODE_BASE_WITH_FILTER,
      CScannerMlkitModule.resolveScannerMode("base_with_filter")
    )
    assertEquals(
      GmsDocumentScannerOptions.SCANNER_MODE_BASE,
      CScannerMlkitModule.resolveScannerMode("BASE")
    )
    assertEquals(
      GmsDocumentScannerOptions.SCANNER_MODE_FULL,
      CScannerMlkitModule.resolveScannerMode("unknown")
    )
  }

  @Test
  fun moduleDefinition_registersExpectedFunctions() {
    val module = CScannerMlkitModule()
    val def = module.definition()
    assertEquals("CScannerMlkit", def.name)
    assertTrue(def.asyncFunctions.containsKey("scanDocument"))
    assertTrue(def.asyncFunctions.containsKey("recognizeText"))
    assertTrue(def.asyncFunctions.containsKey("processImage"))
    assertTrue(def.asyncFunctions.containsKey("redactImage"))
    assertTrue(def.asyncFunctions.containsKey("composeIdCard"))
    assertTrue(def.asyncFunctions.containsKey("sha256File"))
    assertTrue(def.syncFunctions.containsKey("canInstallPackages"))
    assertTrue(def.syncFunctions.containsKey("openInstallPermissionSettings"))
    assertTrue(def.syncFunctions.containsKey("inspectApk"))
    assertTrue(def.syncFunctions.containsKey("installApk"))
  }

  @Test
  fun resolveSafeOutputFile_enforcesAppRootConfinement() {
    val tmpRoot = createTempDir("cscanner-test")
    try {
      val filesDir = File(tmpRoot, "files").apply { mkdirs() }
      val cacheDir = File(tmpRoot, "cache").apply { mkdirs() }
      val roots = listOf(filesDir, cacheDir)

      val validFile = File(filesDir, "cscanner/images/proc_1.jpg")
      val resolved = CScannerMlkitModule.resolveSafeOutputFile(validFile.absolutePath, roots)
      assertTrue(resolved.path.startsWith(filesDir.canonicalPath))

      assertThrows(SecurityException::class.java) {
        CScannerMlkitModule.resolveSafeOutputFile(
          File(filesDir, "../databases/cscanner.db").absolutePath,
          roots
        )
      }
      assertThrows(SecurityException::class.java) {
        CScannerMlkitModule.resolveSafeOutputFile(
          File(filesDir, "databases/cscanner.db").absolutePath,
          roots
        )
      }
      assertThrows(SecurityException::class.java) {
        CScannerMlkitModule.resolveSafeOutputFile("/etc/passwd", roots)
      }
      assertThrows(SecurityException::class.java) {
        CScannerMlkitModule.resolveSafeOutputFile("content://media/external/images/1", roots)
      }
    } finally {
      tmpRoot.deleteRecursively()
    }
  }

  @Test
  fun isAllowedInputUri_andMathHelpers_behaveSafely() {
    val tmpRoot = createTempDir("cscanner-in-test")
    try {
      val filesDir = File(tmpRoot, "files").apply { mkdirs() }
      val roots = listOf(filesDir)

      assertTrue(CScannerMlkitModule.isAllowedInputUri("content://media/external/1", roots))
      assertTrue(
        CScannerMlkitModule.isAllowedInputUri(
          File(filesDir, "cscanner/images/orig_1.jpg").absolutePath,
          roots
        )
      )
      assertFalse(CScannerMlkitModule.isAllowedInputUri("https://example.com/a.jpg", roots))
      assertFalse(CScannerMlkitModule.isAllowedInputUri("/etc/hosts", roots))
      assertFalse(
        CScannerMlkitModule.isAllowedInputUri(
          File(filesDir, "shared_prefs/auth.xml").absolutePath,
          roots
        )
      )

      assertEquals(0f, CScannerMlkitModule.safeClamp01(Double.NaN))
      assertEquals(0f, CScannerMlkitModule.safeClamp01(Double.POSITIVE_INFINITY))
      assertEquals(1f, CScannerMlkitModule.safeClamp01(2.5))
      assertEquals(4, CScannerMlkitModule.calculateInSampleSize(12000, 9000, 4096))
      assertEquals(1, CScannerMlkitModule.calculateInSampleSize(1600, 2200, 4096))
    } finally {
      tmpRoot.deleteRecursively()
    }
  }

  @Test
  fun resolveSafeUpdateApkFile_andSha256_verifyCacheAndDigest() {
    val tmpRoot = createTempDir("cscanner-update-test")
    try {
      val cacheDir = File(tmpRoot, "cache").apply { mkdirs() }
      val updatesDir = File(cacheDir, "updates").apply { mkdirs() }
      val validApk = File(updatesDir, "cscanner-1.2.0-3.apk")
      validApk.writeText("abc")

      val resolved = CScannerMlkitModule.resolveSafeUpdateApkFile(validApk.toURI().toString(), cacheDir)
      assertEquals(validApk.canonicalPath, resolved.canonicalPath)
      assertEquals(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        CScannerMlkitModule.computeSha256Hex(resolved)
      )

      val siblingDir = File(tmpRoot, "cache_evil/updates").apply { mkdirs() }
      val siblingApk = File(siblingDir, "evil.apk").apply { writeText("evil") }
      assertThrows(IllegalArgumentException::class.java) {
        CScannerMlkitModule.resolveSafeUpdateApkFile(siblingApk.absolutePath, cacheDir)
      }

      val rootApk = File(cacheDir, "outside.apk").apply { writeText("no") }
      assertThrows(IllegalArgumentException::class.java) {
        CScannerMlkitModule.resolveSafeUpdateApkFile(rootApk.absolutePath, cacheDir)
      }

      val nonApk = File(updatesDir, "payload.zip").apply { writeText("no") }
      assertThrows(IllegalArgumentException::class.java) {
        CScannerMlkitModule.resolveSafeUpdateApkFile(nonApk.absolutePath, cacheDir)
      }
    } finally {
      tmpRoot.deleteRecursively()
    }
  }
}
