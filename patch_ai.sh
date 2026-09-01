sed -i '2297i \
  if (activeTab === "hengkur_ai") {\
    return (\
      <div className="flex flex-col h-[calc(100vh-140px)] animate-fade-in">\
        <HengkurAIChat \
          currentUser={currentUser} \
          onBotNameChange={(name) => setBotName(name)}\
          onBotAvatarChange={(avatar) => setBotAvatar(avatar)}\
          onBack={() => setActiveTab("direct")}\
        />\
      </div>\
    );\
  }' components/Chat.tsx
