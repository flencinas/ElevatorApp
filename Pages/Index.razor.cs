using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace ElevatorApp.Pages;
public partial class Index : ComponentBase, IAsyncDisposable
{
    [Inject]
    IJSRuntime JSRuntime { get; set; } = default!;

    protected int currentFloor = 0;
    protected int targetFloor = 0;
    protected const int totalFloors = 6; // G, 1, 2, 3, 4, 5
    protected bool isMoving = false;
    protected Direction direction = Direction.Idle;
    protected List<int> requestedFloors = new List<int>();

    protected bool isEmergencyLightOn = false;

    // WebRTC State
    protected bool showRtcControls = false;
    protected string rtcStatus = "Idle";
    protected string localSdp = "";
    protected string remoteSdp = "";
    protected string localIceCandidates = "";
    protected string remoteIceCandidatesInput = "";
    protected DotNetObjectReference<Index> dotNetHelper;


    protected enum Direction { Idle, Up, Down }

    protected override void OnInitialized()
    {
        dotNetHelper = DotNetObjectReference.Create(this);
    }

    protected async Task RequestFloor(int floor)
    {
        if (!requestedFloors.Contains(floor) && floor != currentFloor)
        {
            requestedFloors.Add(floor);
            if (!isMoving)
            {
                await ProcessNextRequest();
            }
        }
        StateHasChanged();
    }

    protected bool IsFloorSelected(int floor)
    {
        return requestedFloors.Contains(floor) || (isMoving && targetFloor == floor);
    }

    protected async Task ProcessNextRequest()
    {
        if (requestedFloors.Count == 0)
        {
            isMoving = false;
            direction = Direction.Idle;
            StateHasChanged();
            return;
        }

        // Simple strategy: pick the first requested floor
        // More complex: pick closest or floor in current direction
        targetFloor = requestedFloors[0];
        requestedFloors.RemoveAt(0);

        isMoving = true;
        if (targetFloor > currentFloor) direction = Direction.Up;
        else if (targetFloor < currentFloor) direction = Direction.Down;
        else
        { // Should not happen if logic is correct
            isMoving = false;
            direction = Direction.Idle;
            await ProcessNextRequest(); // process next if any
            return;
        }

        StateHasChanged();
        await MoveElevator();
    }

    protected async Task MoveElevator()
    {
        while (currentFloor != targetFloor)
        {
            await Task.Delay(1500); // Simulate travel time per floor
            if (direction == Direction.Up) currentFloor++;
            else if (direction == Direction.Down) currentFloor--;
            StateHasChanged();
        }

        // Arrived
        await JSRuntime.InvokeVoidAsync("playArrivalSound");
        isMoving = false;
        direction = Direction.Idle;
        StateHasChanged();

        await Task.Delay(500); // Short pause at floor
        await ProcessNextRequest(); // Check for more requests
    }

    protected void ToggleEmergencyLight()
    {
        isEmergencyLightOn = !isEmergencyLightOn;
        StateHasChanged();
    }

    // --- WebRTC Methods ---
    protected async Task StartEmergencyCall()
    {
        showRtcControls = true;
        rtcStatus = "Initializing call...";
        StateHasChanged();
        await JSRuntime.InvokeVoidAsync("elevatorWebRTC.startCall", dotNetHelper);
    }

    protected async Task ProcessRemoteSdp()
    {
        if (string.IsNullOrWhiteSpace(remoteSdp)) return;
        rtcStatus = "Processing remote SDP...";
        StateHasChanged();
        await JSRuntime.InvokeVoidAsync("elevatorWebRTC.processRemoteSdp", remoteSdp);
        remoteSdp = ""; // Clear after processing
    }

    protected async Task AddRemoteIceCandidates()
    {
        if (string.IsNullOrWhiteSpace(remoteIceCandidatesInput)) return;
        var candidates = remoteIceCandidatesInput.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        foreach (var candidateStr in candidates)
        {
            if (!string.IsNullOrWhiteSpace(candidateStr))
            {
                await JSRuntime.InvokeVoidAsync("elevatorWebRTC.addRemoteIceCandidate", candidateStr.Trim());
            }
        }
        remoteIceCandidatesInput = ""; // Clear after processing
        rtcStatus = "Remote ICE candidates added.";
        StateHasChanged();
    }

    [JSInvokable]
    public void SetLocalSdp(string type, string sdp)
    {
        localSdp = $"Type: {type}\nSDP: {sdp}";
        rtcStatus = type == "offer" ? "Offer created. Send to Call Center." : "Answer created. Send to Elevator.";
        StateHasChanged();
    }

    [JSInvokable]
    public void AddLocalIceCandidate(string candidate)
    {
        localIceCandidates += candidate + "\n";
        rtcStatus = "ICE Candidate gathered. Add to remote peer.";
        StateHasChanged();
    }

    [JSInvokable]
    public void SetCallStatus(string status)
    {
        rtcStatus = status;
        StateHasChanged();
    }

    public async ValueTask DisposeAsync()
    {
        if (dotNetHelper != null)
        {
            await JSRuntime.InvokeVoidAsync("elevatorWebRTC.cleanup");
            dotNetHelper.Dispose();
        }
    }
}