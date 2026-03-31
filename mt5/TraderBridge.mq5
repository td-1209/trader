//+------------------------------------------------------------------+
//| TraderBridge.mq5 - HTTP Polling Bridge EA                        |
//| trading serviceから注文キューをポーリングして実行するEA             |
//+------------------------------------------------------------------+
#property copyright "trader"
#property version   "1.00"
#property strict

input string BridgeUrl = "https://trader-ai.app/api/trading"; // trading service URL
input string BridgeAuth = "";  // Basic Auth (user:password)
input int    PollIntervalMs = 1000; // ポーリング間隔(ms)

//+------------------------------------------------------------------+
int OnInit()
{
   EventSetMillisecondTimer(PollIntervalMs);
   Print("TraderBridge started - polling ", BridgeUrl);

   // 初回起動時にポジション同期
   SyncPositions();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("TraderBridge stopped");
}

//+------------------------------------------------------------------+
void OnTimer()
{
   PollCommands();
   SyncPositions();
}

//+------------------------------------------------------------------+
void PollCommands()
{
   string url = BridgeUrl + "/bridge/commands";
   string result = HttpGet(url);
   if(result == "") return;

   // レスポンス: {"commands":[{"id":"xxx","action":"order","symbol":"USDJPY",...}]}
   // 簡易パース: commandsが空なら何もしない
   if(StringFind(result, "\"commands\":[]") >= 0) return;

   // コマンドを1つずつ処理
   int pos = 0;
   while(true)
   {
      int start = StringFind(result, "{\"id\":", pos);
      if(start < 0) break;

      int end = StringFind(result, "}", start);
      if(end < 0) break;

      string cmd = StringSubstr(result, start, end - start + 1);
      ProcessCommand(cmd);
      pos = end + 1;
   }
}

//+------------------------------------------------------------------+
void ProcessCommand(string json)
{
   string id     = JsonGetString(json, "id");
   string action = JsonGetString(json, "action");

   Print("Processing command: ", id, " action: ", action);

   string response;
   if(action == "order")
      response = HandleOrder(json);
   else if(action == "close")
      response = HandleClose(json);
   else
      response = "{\"success\":false,\"error\":\"Unknown action\"}";

   // 結果を返送
   string url = BridgeUrl + "/bridge/results";
   string body = "{\"commandId\":\"" + id + "\"," + StringSubstr(response, 1);
   HttpPost(url, body);
}

//+------------------------------------------------------------------+
string HandleOrder(string json)
{
   string symbol   = JsonGetString(json, "symbol");
   string position = JsonGetString(json, "position");
   double volume   = JsonGetDouble(json, "volume");

   if(symbol == "" || position == "" || volume <= 0)
      return "{\"success\":false,\"error\":\"Invalid parameters\"}";

   StringToUpper(symbol);

   ENUM_ORDER_TYPE orderType;
   if(position == "long")
      orderType = ORDER_TYPE_BUY;
   else if(position == "short")
      orderType = ORDER_TYPE_SELL;
   else
      return "{\"success\":false,\"error\":\"Invalid position: " + position + "\"}";

   double price = (orderType == ORDER_TYPE_BUY)
      ? SymbolInfoDouble(symbol, SYMBOL_ASK)
      : SymbolInfoDouble(symbol, SYMBOL_BID);

   if(price == 0)
      return "{\"success\":false,\"error\":\"Symbol not found: " + symbol + "\"}";

   double tp = JsonGetDouble(json, "tp");
   double sl = JsonGetDouble(json, "sl");

   MqlTradeRequest request = {};
   MqlTradeResult  result  = {};

   request.action       = TRADE_ACTION_DEAL;
   request.symbol       = symbol;
   request.volume       = volume;
   request.type         = orderType;
   request.price        = price;
   request.deviation    = 10;
   request.magic        = 123456;
   request.comment      = "TraderBridge";
   request.type_filling = ORDER_FILLING_IOC;
   if(tp > 0) request.tp = tp;
   if(sl > 0) request.sl = sl;

   if(!OrderSend(request, result))
      return "{\"success\":false,\"error\":\"OrderSend failed: " + IntegerToString(result.retcode) + " " + result.comment + "\"}";

   if(result.retcode != TRADE_RETCODE_DONE)
      return "{\"success\":false,\"error\":\"Rejected: " + IntegerToString(result.retcode) + " " + result.comment + "\"}";

   return "{\"success\":true,\"ticket\":\"" + IntegerToString(result.deal) +
          "\",\"price\":\"" + DoubleToString(result.price, 8) + "\"}";
}

//+------------------------------------------------------------------+
string HandleClose(string json)
{
   ulong ticket = (ulong)StringToInteger(JsonGetString(json, "ticket"));
   if(ticket == 0)
      return "{\"success\":false,\"error\":\"Invalid ticket\"}";

   if(!PositionSelectByTicket(ticket))
      return "{\"success\":false,\"error\":\"Position not found\"}";

   string symbol = PositionGetString(POSITION_SYMBOL);
   double volume = PositionGetDouble(POSITION_VOLUME);
   ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);

   ENUM_ORDER_TYPE closeType = (posType == POSITION_TYPE_BUY) ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
   double price = (closeType == ORDER_TYPE_BUY)
      ? SymbolInfoDouble(symbol, SYMBOL_ASK)
      : SymbolInfoDouble(symbol, SYMBOL_BID);

   MqlTradeRequest request = {};
   MqlTradeResult  result  = {};

   request.action       = TRADE_ACTION_DEAL;
   request.symbol       = symbol;
   request.volume       = volume;
   request.type         = closeType;
   request.price        = price;
   request.position     = ticket;
   request.deviation    = 10;
   request.type_filling = ORDER_FILLING_IOC;
   request.magic    = 123456;
   request.comment  = "TraderBridge Close";

   if(!OrderSend(request, result))
      return "{\"success\":false,\"error\":\"Close failed: " + IntegerToString(result.retcode) + " " + result.comment + "\"}";

   if(result.retcode != TRADE_RETCODE_DONE)
      return "{\"success\":false,\"error\":\"Close rejected: " + IntegerToString(result.retcode) + " " + result.comment + "\"}";

   double profit = PositionGetDouble(POSITION_PROFIT);

   return "{\"success\":true,\"ticket\":\"" + IntegerToString(result.deal) +
          "\",\"price\":\"" + DoubleToString(result.price, 8) +
          "\",\"profit\":\"" + DoubleToString(profit, 2) + "\"}";
}

//+------------------------------------------------------------------+
void SyncPositions()
{
   string json = "{\"positions\":[";
   int total = PositionsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != 123456) continue;

      string symbol   = PositionGetString(POSITION_SYMBOL);
      double volume   = PositionGetDouble(POSITION_VOLUME);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double profit   = PositionGetDouble(POSITION_PROFIT);
      string posType  = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "long" : "short";

      if(i > 0) json += ",";
      json += "{\"ticket\":\"" + IntegerToString(ticket) +
              "\",\"symbol\":\"" + symbol +
              "\",\"position\":\"" + posType +
              "\",\"volume\":" + DoubleToString(volume, 2) +
              ",\"openPrice\":\"" + DoubleToString(openPrice, 8) +
              "\",\"profit\":\"" + DoubleToString(profit, 2) + "\"}";
   }
   json += "]}";

   HttpPost(BridgeUrl + "/bridge/sync", json);
}

//+------------------------------------------------------------------+
// HTTP通信
//+------------------------------------------------------------------+
string HttpGet(string url)
{
   char data[];
   char result[];
   string headers = "Content-Type: application/json\r\n";
   if(BridgeAuth != "")
      headers += "Authorization: Basic " + BridgeAuth + "\r\n";

   string resultHeaders;
   int timeout = 5000;

   ResetLastError();
   int code = WebRequest("GET", url, headers, timeout, data, result, resultHeaders);

   if(code == -1)
      return "";
   if(code != 200)
      return "";

   return CharArrayToString(result);
}

void HttpPost(string url, string body)
{
   char data[];
   char result[];
   string headers = "Content-Type: application/json\r\n";
   if(BridgeAuth != "")
      headers += "Authorization: Basic " + BridgeAuth + "\r\n";

   StringToCharArray(body, data, 0, StringLen(body));

   string resultHeaders;
   int timeout = 5000;

   ResetLastError();
   int code = WebRequest("POST", url, headers, timeout, data, result, resultHeaders);

   if(code == -1)
      Print("HttpPost failed: ", GetLastError());
}

//+------------------------------------------------------------------+
// 簡易JSONパーサー
//+------------------------------------------------------------------+
string JsonGetString(string json, string key)
{
   string search = "\"" + key + "\":\"";
   int start = StringFind(json, search);
   if(start < 0) return "";
   start += StringLen(search);
   int end = StringFind(json, "\"", start);
   if(end < 0) return "";
   return StringSubstr(json, start, end - start);
}

double JsonGetDouble(string json, string key)
{
   string strVal = JsonGetString(json, key);
   if(strVal != "") return StringToDouble(strVal);

   string search = "\"" + key + "\":";
   int start = StringFind(json, search);
   if(start < 0) return 0;
   start += StringLen(search);
   return StringToDouble(StringSubstr(json, start, 20));
}
