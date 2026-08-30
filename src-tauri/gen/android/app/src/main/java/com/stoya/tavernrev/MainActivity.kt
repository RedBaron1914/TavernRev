package com.stoya.tavernrev

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.content.ClipData
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
          try {
              val file = File(filePath)
              if (!file.exists()) {
                  android.util.Log.e("TavernRev", "APK file does not exist at: $filePath")
                  android.widget.Toast.makeText(applicationContext, "APK file not found on disk", android.widget.Toast.LENGTH_LONG).show()
                  return@runOnUiThread
              }

              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                  if (!packageManager.canRequestPackageInstalls()) {
                      android.widget.Toast.makeText(
                          applicationContext,
                          "Please allow installation from this source",
                          android.widget.Toast.LENGTH_LONG
                      ).show()
                      val manageIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                          data = Uri.parse("package:$packageName")
                          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                      }
                      startActivity(manageIntent)
                      return@runOnUiThread
                  }
              }

              val uri = FileProvider.getUriForFile(applicationContext, "${packageName}.fileprovider", file)
              val intent = Intent(Intent.ACTION_VIEW).apply {
                  setDataAndType(uri, "application/vnd.android.package-archive")
                  clipData = ClipData.newRawUri("", uri)
                  addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                  addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                  addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
              }

              val resInfoList = packageManager.queryIntentActivities(intent, 0)
              for (resolveInfo in resInfoList) {
                  val pkgName = resolveInfo.activityInfo.packageName
                  grantUriPermission(pkgName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
              }

              startActivity(intent)
          } catch (e: Throwable) {
              android.util.Log.e("TavernRev", "Install failed", e)
              try {
                  android.widget.Toast.makeText(applicationContext, "Install failed: ${e.message}", android.widget.Toast.LENGTH_LONG).show()
              } catch (_: Throwable) {}
          }
      }
  }
}
