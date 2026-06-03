import io.shiftleft.semanticcpg.language.*

@main def main(inputPath: String): Unit = {
  val sources = Set("gets", "fgets", "scanf", "read", "recv")
  val sinks = Set("system", "popen", "execl", "execve", "strcpy", "strcat")
  val formattingCalls = Set("snprintf", "sprintf", "vsnprintf")
  val bufferCopyCalls = Set("strcpy", "strcat", "memcpy")

  importCode(inputPath)

  val allCalls = cpg.call.l
  val hasGuard = cpg.controlStructure.code("if.*").nonEmpty
  val hasFormatting = allCalls.exists(call => formattingCalls.contains(call.name))
  val hasBufferCopy = allCalls.exists(call => bufferCopyCalls.contains(call.name))

  val sourceCalls = allCalls.filter(call => sources.contains(call.name))
  val sinkCalls = allCalls.filter(call => sinks.contains(call.name))

  val results = for {
    src <- sourceCalls
    sink <- sinkCalls
    srcLine = src.lineNumber.getOrElse(-1)
    sinkLine = sink.lineNumber.getOrElse(-1)
    if srcLine >= 0
    if sinkLine >= 0
    if srcLine < sinkLine
  } yield {
    val enclosingMethod = sink.method.name.headOption.getOrElse("")
    val pathLength = sinkLine - srcLine
    val sourceCode = src.code.replace("\t", " ").replace("\n", " ")
    val sinkCode = sink.code.replace("\t", " ").replace("\n", " ")
    val fileName = sink.file.name.headOption.getOrElse(inputPath)

    List(
      "JOERN_RESULT",
      fileName,
      src.name,
      sink.name,
      srcLine.toString,
      sinkLine.toString,
      pathLength.toString,
      hasGuard.toString,
      hasBufferCopy.toString,
      hasFormatting.toString,
      enclosingMethod,
      sourceCode,
      sinkCode,
    ).mkString("\t")
  }

  results.foreach(println)
}
