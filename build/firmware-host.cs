using System;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using Microsoft.PowerShell;

// A standalone x86 host gives vendor-created native threads adequate stack
// reserve. Changing a managed calling thread's stack would not fix those threads.
public static class FirmwareHost {
  public static int Main(string[] args) {
    if (args.Length != 2) { Console.Error.WriteLine("Expected worker script and request paths."); return 1; }
    bool resultSeen = false, succeeded = false;
    try {
      var state = InitialSessionState.CreateDefault();
      state.ExecutionPolicy = ExecutionPolicy.Bypass;
      using (var runspace = RunspaceFactory.CreateRunspace(state)) {
        runspace.Open();
        using (var ps = PowerShell.Create()) {
          ps.Runspace = runspace;
          ps.AddCommand(args[0]).AddParameter("Request", args[1]);
          var output = new PSDataCollection<PSObject>();
          output.DataAdded += (sender, e) => {
            var line = output[e.Index].ToString();
            Console.WriteLine(line); Console.Out.Flush();
            if (line.Contains("\"success\":")) {
              resultSeen = true;
              succeeded = line.Contains("\"success\":true");
            }
          };
          ps.Streams.Error.DataAdded += (sender, e) => {
            Console.Error.WriteLine(ps.Streams.Error[e.Index].ToString()); Console.Error.Flush();
          };
          var pending = ps.BeginInvoke<PSObject, PSObject>(null, output);
          ps.EndInvoke(pending);
          // The worker catches failures and emits a final success:false record.
          // HadErrors also counts intentionally silenced optional lookups.
          return resultSeen && succeeded ? 0 : 1;
        }
      }
    } catch (Exception error) { Console.Error.WriteLine(error.ToString()); return 1; }
  }
}
