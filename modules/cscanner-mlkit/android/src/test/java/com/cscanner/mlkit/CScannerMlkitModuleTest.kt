package com.cscanner.mlkit

import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CScannerMlkitModuleTest {
  @Test
  fun buildScannerOptions_handlesAllModesAndClampsPageLimit() {
    val full = CScannerMlkitModule.buildScannerOptions(24, true, "FULL")
    assertNotNull(full)

    val base = CScannerMlkitModule.buildScannerOptions(0, false, "base")
    assertNotNull(base)

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
    assertTrue(def.asyncFunctions.containsKey("composeIdCard"))
  }
}
