package com.stoya.tavernrev

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  @androidx.annotation.Keep
  fun installApk(filePath: String) {
      runOnUiThread {
          val file = File(filePath)
          if (!file.exists()) return@runOnUiThread
          val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
          val intent = Intent(Intent.ACTION_VIEW).apply {
              setDataAndType(uri, "application/vnd.android.package-archive")
              addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          startActivity(intent)
      }
  }
}
